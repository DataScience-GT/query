import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import {
  hackathonParticipants,
  hackathonProjects,
  judgingChallenges,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingRooms,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  chunks,
  idForLabel,
  initializeGroups,
  lockEdition,
  readSetupLock,
  rebuildDerivedMemberships,
  resolveLabels,
} from "./challenges";
import type { JudgingDb } from "./config";
import { DevpostFileError, httpUrl, readDevpostExport } from "./devpost";
import type { DevpostImport, DevpostProject } from "./devpost";
import { revokeRoomAccess } from "./rooms";
import { normalizeLabel, sameLabel } from "./scope";

// Getting projects into judging: a Devpost submissions export, or the
// projects teams submitted through the portal. Both land in judging_entry;
// `source` remembers which, because a Devpost replace only ever swaps out the
// Devpost half.

export const DEVPOST_MAX_BYTES = 10 * 1024 * 1024;

export type ImportMode = "automatic" | "replace";

export type ImportFacts = {
  inventoryLocked: boolean;
  claimsStarted: boolean;
  hasEvaluations: boolean;
  scheduleSaved: boolean;
};

/**
 * Whether an import replaces the Devpost projects or only adds new ones, and
 * whether doing so has to sign guest judges out.
 *
 * `automatic` replaces until anything depends on the current list (a room
 * link, a claim, a score, a saved schedule), then only adds. `replace` is the
 * organiser insisting: refused once hackers, a schedule or scores depend on
 * the list, and once room links are out it takes the hackathon's name typed
 * out, because every guest judge is signed out.
 */
export function planImport(
  mode: ImportMode,
  facts: ImportFacts,
  confirm: { typed?: string; hackathonName: string },
): { replace: boolean; revokeAccess: boolean } {
  if (mode === "automatic") {
    const settled =
      facts.inventoryLocked ||
      facts.claimsStarted ||
      facts.hasEvaluations ||
      facts.scheduleSaved;
    return { replace: !settled, revokeAccess: false };
  }

  if (facts.claimsStarted) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Hackers have started claiming projects, so the list can only grow. Import in automatic mode to add the new projects.",
    });
  }
  if (facts.scheduleSaved) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "A schedule is saved against the current projects. Drop it on the Schedule tab first, or import in automatic mode to add new projects.",
    });
  }
  if (facts.hasEvaluations) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Judges have scored the current projects. Import in automatic mode to add new projects, or drop evaluations from Resets first.",
    });
  }
  if (
    facts.inventoryLocked &&
    confirm.typed?.trim() !== confirm.hackathonName.trim()
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Room QR links are out, and replacing the projects signs every guest judge out. Type the hackathon name, ${confirm.hackathonName}, to confirm.`,
    });
  }
  return { replace: true, revokeAccess: facts.inventoryLocked };
}

/** A short, non-reversible tag for the uploaded file, for the audit log. */
export function fileTag(csv: string): string {
  return createHash("sha256").update(csv).digest("hex").slice(0, 12);
}

/**
 * A replacement must not orphan a room: every active room judging a plain
 * challenge needs that challenge to still have projects afterwards, from the
 * new file or from portal submissions.
 */
async function assertRoomsKeepProjects(
  tx: JudgingDb,
  hackathonId: string,
  labels: readonly string[],
) {
  const rooms = await tx
    .select({
      name: judgingRooms.name,
      challengeId: judgingRooms.challengeId,
      label: judgingChallenges.label,
    })
    .from(judgingRooms)
    .innerJoin(
      judgingChallenges,
      eq(judgingChallenges.id, judgingRooms.challengeId),
    )
    .where(
      and(
        eq(judgingRooms.hackathonId, hackathonId),
        isNull(judgingRooms.archivedAt),
        eq(judgingChallenges.isGroup, false),
      ),
    );
  if (rooms.length === 0) return;

  const portalBacked = new Set(
    (
      await tx
        .select({ challengeId: judgingEntryChallenges.challengeId })
        .from(judgingEntryChallenges)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEntryChallenges.entryId),
        )
        .where(
          and(
            eq(judgingEntries.hackathonId, hackathonId),
            eq(judgingEntries.source, "portal"),
            isNull(judgingEntries.deletedAt),
          ),
        )
    ).map((row) => row.challengeId),
  );

  const orphaned = rooms.find(
    (room) =>
      !portalBacked.has(room.challengeId) &&
      !labels.some((label) => sameLabel(label, room.label)),
  );
  if (orphaned) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${orphaned.name} judges ${orphaned.label}, which this file does not have. Point the room at another challenge or archive it, then import again.`,
    });
  }
}

type NewEntry = {
  source: "devpost" | "portal";
  sourceProjectId?: string | null;
  submissionUrl?: string | null;
  title: string;
  description: string;
  demoLinks: string[];
  videoUrl: string | null;
  technologies: string[];
  universities: string[];
  prizeCategories: string[];
  participantCount: number;
  projectCreatedAt: Date | null;
  submittedAt: Date | null;
  members: {
    name: string;
    email: string;
    userId?: string | null;
  }[];
};

/**
 * Inserts entries with their members and opt-ins, then derives group and
 * general memberships. Returns the new ids in input order.
 */
async function insertEntries(
  tx: JudgingDb,
  hackathonId: string,
  entries: readonly NewEntry[],
  challengeIds: Map<string, string>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const slice of chunks(entries, 200)) {
    const rows = await tx
      .insert(judgingEntries)
      .values(
        slice.map(({ members: _members, ...entry }) => ({
          ...entry,
          hackathonId,
        })),
      )
      .returning({ id: judgingEntries.id });
    ids.push(...rows.map((row) => row.id));
  }

  const members = entries.flatMap((entry, i) =>
    entry.members.map((member, order) => ({
      entryId: ids[i]!,
      hackathonId,
      name: member.name,
      email: member.email,
      userId: member.userId ?? null,
      displayOrder: order,
    })),
  );
  for (const slice of chunks(members)) {
    await tx.insert(judgingEntryMembers).values(slice);
  }

  const optIns = entries.flatMap((entry, i) => {
    const seen = new Set<string>();
    return entry.prizeCategories.flatMap((label) => {
      const challengeId = idForLabel(challengeIds, label);
      if (!challengeId || seen.has(challengeId)) return [];
      seen.add(challengeId);
      return [{ entryId: ids[i]!, challengeId, hackathonId, isOptIn: true }];
    });
  });
  for (const slice of chunks(optIns, 1000)) {
    await tx.insert(judgingEntryChallenges).values(slice);
  }

  await rebuildDerivedMemberships(tx, hackathonId, ids);
  return ids;
}

const fromDevpost = (project: DevpostProject): NewEntry => ({
  source: "devpost",
  submissionUrl: project.submissionUrl,
  title: project.title,
  description: project.description,
  demoLinks: project.demoLinks,
  videoUrl: project.videoUrl,
  technologies: project.technologies,
  universities: project.universities,
  prizeCategories: project.prizeCategories,
  participantCount: project.participantCount,
  projectCreatedAt: project.projectCreatedAt,
  submittedAt: project.submittedAt,
  members: project.members,
});

/**
 * Applies a Devpost submissions export in one transaction. The file is read
 * before the transaction starts, so a bad file never takes the lock.
 */
export async function importDevpost(
  db: DrizzleDB,
  input: {
    hackathonId: string;
    csv: string;
    mode: ImportMode;
    confirmation?: string;
    userId: string;
  },
) {
  const bytes = Buffer.byteLength(input.csv, "utf8");
  if (bytes > DEVPOST_MAX_BYTES) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB. Upload the submissions export on its own, not a combined workbook.`,
    });
  }

  let parsed: DevpostImport;
  try {
    parsed = readDevpostExport(input.csv);
  } catch (error) {
    if (error instanceof DevpostFileError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }

  const result = await db.transaction(async (tx) => {
    const { hackathon, config } = await lockEdition(tx, input.hackathonId);
    const lock = await readSetupLock(tx, input.hackathonId);
    const plan = planImport(
      input.mode,
      {
        inventoryLocked: !!config.inventoryLockedAt,
        claimsStarted: !!config.claimsStartedAt,
        hasEvaluations: lock.hasEvaluations,
        scheduleSaved: lock.scheduleSaved,
      },
      { typed: input.confirmation, hackathonName: hackathon.name },
    );

    await initializeGroups(tx, input.hackathonId, config);

    let removed = 0;
    let revoked = { links: 0, sessions: 0, presence: 0 };
    if (plan.replace) {
      await assertRoomsKeepProjects(tx, input.hackathonId, parsed.labels);
      if (plan.revokeAccess) {
        revoked = await revokeRoomAccess(
          tx,
          { hackathonId: input.hackathonId },
          input.userId,
        );
      }
      // Hard delete: nothing scored or claimed them (planImport made sure),
      // and their submission URLs must be free for the new rows.
      const gone = await tx
        .delete(judgingEntries)
        .where(
          and(
            eq(judgingEntries.hackathonId, input.hackathonId),
            eq(judgingEntries.source, "devpost"),
          ),
        )
        .returning({ id: judgingEntries.id });
      removed = gone.length;
    }

    const labels = await resolveLabels(tx, input.hackathonId, parsed.labels);

    // Removed entries keep their URL, so an organiser's removal survives a
    // re-import of the same file.
    const known = new Set(
      (
        await tx
          .select({ url: judgingEntries.submissionUrl })
          .from(judgingEntries)
          .where(
            and(
              eq(judgingEntries.hackathonId, input.hackathonId),
              isNotNull(judgingEntries.submissionUrl),
            ),
          )
      ).map((row) => row.url),
    );
    const fresh = parsed.projects.filter((p) => !known.has(p.submissionUrl));
    await insertEntries(
      tx,
      input.hackathonId,
      fresh.map(fromDevpost),
      labels.ids,
    );

    return {
      mode: plan.replace ? ("replace" as const) : ("add" as const),
      imported: fresh.length,
      skipped: parsed.projects.length - fresh.length,
      removed,
      newChallenges: labels.created,
      linksRevoked: revoked.links,
      guestsSignedOut: revoked.sessions,
    };
  });

  return {
    ...result,
    collapsedRows: parsed.collapsedRows,
    drafts: parsed.drafts,
    rejected: parsed.rejected,
    fileTag: fileTag(input.csv),
    bytes,
  };
}

// Portal tracks are free text from a fixed list, and "NONE" means none.
const NO_TRACK = "none";
const CREATE_X_LABEL = "CreateX";

/** The challenge labels a portal submission opted into. */
export function portalLabels(project: {
  tracks: string[] | null;
  challenges: string[] | null;
  isCreateX: boolean | null;
}): string[] {
  const out: string[] = [];
  const raw = [
    ...(project.tracks ?? []),
    ...(project.challenges ?? []),
    ...(project.isCreateX ? [CREATE_X_LABEL] : []),
  ];
  for (const value of raw) {
    const label = normalizeLabel(value);
    if (!label || label.toLowerCase() === NO_TRACK) continue;
    if (!out.some((known) => sameLabel(known, label))) out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

const PROMOTABLE = ["submitted", "judging", "winner"] as const;

/**
 * Copies portal submissions into judging. Safe to run again as late ones
 * land: a project already promoted is skipped, including one an organiser
 * removed, which stays removed. Members are the team's participants (or the
 * solo submitter) and come linked to their accounts, so nobody has to claim.
 */
export async function promoteSubmissions(
  db: DrizzleDB,
  input: { hackathonId: string },
) {
  return db.transaction(async (tx) => {
    const { config } = await lockEdition(tx, input.hackathonId);
    await initializeGroups(tx, input.hackathonId, config);

    const submitted = await tx
      .select({
        id: hackathonProjects.id,
        teamId: hackathonProjects.teamId,
        submittedById: hackathonProjects.submittedById,
        name: hackathonProjects.name,
        description: hackathonProjects.description,
        technologies: hackathonProjects.technologies,
        tracks: hackathonProjects.tracks,
        challenges: hackathonProjects.challenges,
        isCreateX: hackathonProjects.isCreateX,
        githubUrl: hackathonProjects.githubUrl,
        demoUrl: hackathonProjects.demoUrl,
        videoUrl: hackathonProjects.videoUrl,
        slides: hackathonProjects.slides,
        submittedAt: hackathonProjects.submittedAt,
        createdAt: hackathonProjects.createdAt,
      })
      .from(hackathonProjects)
      .where(
        and(
          eq(hackathonProjects.hackathonId, input.hackathonId),
          inArray(hackathonProjects.status, [...PROMOTABLE]),
          isNull(hackathonProjects.withdrawnByAdminAt),
        ),
      );

    const promoted = new Set(
      (
        await tx
          .select({ id: judgingEntries.sourceProjectId })
          .from(judgingEntries)
          .where(
            and(
              eq(judgingEntries.hackathonId, input.hackathonId),
              isNotNull(judgingEntries.sourceProjectId),
            ),
          )
      ).map((row) => row.id),
    );
    const pending = submitted.filter((project) => !promoted.has(project.id));
    if (pending.length === 0) {
      return {
        promoted: 0,
        alreadyPromoted: submitted.length,
        unlinkedMembers: 0,
        newChallenges: 0,
      };
    }

    const teamIds = [
      ...new Set(
        pending.map((p) => p.teamId).filter((id): id is string => !!id),
      ),
    ];
    const submitterIds = [
      ...new Set(
        pending
          .map((p) => p.submittedById)
          .filter((id): id is string => !!id),
      ),
    ];
    const people =
      teamIds.length + submitterIds.length > 0
        ? await tx
            .select({
              id: hackathonParticipants.id,
              userId: hackathonParticipants.userId,
              teamId: hackathonParticipants.teamId,
              firstName: hackathonParticipants.firstName,
              lastName: hackathonParticipants.lastName,
              school: hackathonParticipants.school,
              accountName: users.name,
              email: users.email,
            })
            .from(hackathonParticipants)
            .innerJoin(users, eq(users.id, hackathonParticipants.userId))
            .where(
              and(
                eq(hackathonParticipants.hackathonId, input.hackathonId),
                or(
                  teamIds.length > 0
                    ? inArray(hackathonParticipants.teamId, teamIds)
                    : undefined,
                  submitterIds.length > 0
                    ? inArray(hackathonParticipants.id, submitterIds)
                    : undefined,
                ),
              ),
            )
        : [];

    // One project per person per edition. Someone already on an entry (a
    // Devpost project they claimed, say) is still listed here, unlinked.
    const linked = new Set(
      (
        await tx
          .select({ userId: judgingEntryMembers.userId })
          .from(judgingEntryMembers)
          .where(
            and(
              eq(judgingEntryMembers.hackathonId, input.hackathonId),
              isNotNull(judgingEntryMembers.userId),
            ),
          )
      ).map((row) => row.userId),
    );
    let unlinkedMembers = 0;

    const entries = pending.map((project): NewEntry => {
      const team = project.teamId
        ? people.filter((p) => p.teamId === project.teamId)
        : [];
      const roster = team.length
        ? team
        : people.filter((p) => p.id === project.submittedById);
      // The submitter first, then the rest of the team by name.
      roster.sort(
        (a, b) =>
          Number(b.id === project.submittedById) -
            Number(a.id === project.submittedById) ||
          (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
          a.id.localeCompare(b.id),
      );

      const members = roster.map((person) => {
        const name =
          [person.firstName, person.lastName]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(" ") ||
          person.accountName?.trim() ||
          person.email;
        const free = !linked.has(person.userId);
        if (free) linked.add(person.userId);
        else unlinkedMembers += 1;
        return {
          name,
          email: person.email.toLowerCase(),
          userId: free ? person.userId : null,
        };
      });

      const demoLinks = [
        ...new Set(
          [project.demoUrl, project.githubUrl, project.slides]
            .map((url) => (url ? httpUrl(url) : null))
            .filter((url): url is string => url !== null),
        ),
      ];

      return {
        source: "portal",
        sourceProjectId: project.id,
        title: project.name,
        description: project.description,
        demoLinks,
        videoUrl: project.videoUrl ? httpUrl(project.videoUrl) : null,
        technologies: project.technologies ?? [],
        universities: [
          ...new Set(
            roster
              .map((person) => person.school?.trim())
              .filter((school): school is string => !!school),
          ),
        ],
        prizeCategories: portalLabels(project),
        participantCount: Math.max(1, members.length),
        projectCreatedAt: project.createdAt,
        submittedAt: project.submittedAt,
        members,
      };
    });

    const labels = await resolveLabels(
      tx,
      input.hackathonId,
      entries.flatMap((entry) => entry.prizeCategories),
    );
    await insertEntries(tx, input.hackathonId, entries, labels.ids);

    return {
      promoted: entries.length,
      alreadyPromoted: submitted.length - pending.length,
      unlinkedMembers,
      newChallenges: labels.created,
    };
  });
}
