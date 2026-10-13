import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingSchedules,
} from "@query/db";
import { assertHackathonExists, ensureJudgingConfig } from "./config";
import type { JudgingConfig, JudgingDb } from "./config";
import { normalizeLabel } from "./scope";
import type { ChallengeMode } from "./scope";

// The challenge tree an edition is judged in, and the rows that put projects
// into it. A project opts into challenges (from its Devpost prizes or portal
// tracks); membership of the challenge's group and of every general challenge
// follows from that and is rebuilt, never edited by hand.

/** Postgres caps a statement at 65535 parameters; inserts go in slices. */
export function chunks<T>(items: readonly T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const labelKey = (label: string) => normalizeLabel(label).toLowerCase();

/**
 * Serialises organiser writes for one edition: imports, resets, room and
 * challenge changes all take this row lock before reading what they check.
 * Returns the edition and its config as they stand under the lock.
 */
export async function lockEdition(tx: JudgingDb, hackathonId: string) {
  const hackathon = await assertHackathonExists(tx, hackathonId);
  await ensureJudgingConfig(tx, hackathonId);
  const [config] = await tx
    .select()
    .from(judgingConfigs)
    .where(eq(judgingConfigs.hackathonId, hackathonId))
    .for("update")
    .limit(1);
  return { hackathon, config: config! };
}

/** What has happened that freezes the shape of judging. */
export async function readSetupLock(tx: JudgingDb, hackathonId: string) {
  const [[schedule], [evaluation], [draft]] = await Promise.all([
    tx
      .select({ id: judgingSchedules.id })
      .from(judgingSchedules)
      .where(eq(judgingSchedules.hackathonId, hackathonId))
      .limit(1),
    tx
      .select({ id: judgingEvaluations.id })
      .from(judgingEvaluations)
      .where(eq(judgingEvaluations.hackathonId, hackathonId))
      .limit(1),
    tx
      .select({ id: judgingEvaluationDrafts.id })
      .from(judgingEvaluationDrafts)
      .where(eq(judgingEvaluationDrafts.hackathonId, hackathonId))
      .limit(1),
  ]);
  return {
    scheduleSaved: !!schedule,
    hasEvaluations: !!evaluation || !!draft,
  };
}

/**
 * Refuses a change to the challenge tree (grouping, mode, general) once a
 * schedule is saved or a judge has started scoring: both were built against
 * the tree as it was.
 */
export async function assertStructureEditable(
  tx: JudgingDb,
  hackathonId: string,
) {
  const lock = await readSetupLock(tx, hackathonId);
  if (lock.scheduleSaved) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "A saved schedule was built on these challenges. Drop the schedule on the Schedule tab before regrouping them.",
    });
  }
  if (lock.hasEvaluations) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Judges have started scoring these challenges, so their grouping is fixed. Rename them if you need to; drop evaluations from Resets to regroup.",
    });
  }
}

// ---------------------------------------------------------------------------
// Pure rules

export type ChallengeRow = {
  id: string;
  label: string;
  parentId: string | null;
  isGroup: boolean;
  isGeneral: boolean;
  importLabelMatch: string | null;
  mode: ChallengeMode;
};

/** Every edition starts with these two groups. */
export const STARTER_GROUPS = [
  {
    label: "General",
    isGroup: true,
    isGeneral: true,
    mode: "scheduled",
    importLabelMatch: null,
    displayOrder: 0,
  },
  {
    label: "MLH Challenges",
    isGroup: true,
    isGeneral: false,
    mode: "unscheduled",
    importLabelMatch: "MLH",
    displayOrder: 1,
  },
] as const;

/**
 * The group a newly seen label is filed under: the first top-level group
 * whose import match appears in the label, ignoring case. `challenges` must
 * already be in display order.
 */
export function groupForLabel(
  label: string,
  challenges: readonly ChallengeRow[],
): ChallengeRow | null {
  const haystack = label.toLowerCase();
  return (
    challenges.find(
      (c) =>
        c.isGroup &&
        c.parentId === null &&
        !!c.importLabelMatch?.trim() &&
        haystack.includes(c.importLabelMatch.trim().toLowerCase()),
    ) ?? null
  );
}

export type LabelPlan = {
  /** Labels that name a challenge already there, by label key. */
  reuse: Map<string, string>;
  /** Labels to insert, each once, with the group they belong under. */
  create: { label: string; parentId: string | null }[];
};

/**
 * Matches labels to existing (non-group) challenges ignoring case and
 * spacing, and plans the rest. Groups are never matched: a project opts into
 * a prize, and group membership follows from it.
 */
export function planLabels(
  labels: readonly string[],
  challenges: readonly ChallengeRow[],
): LabelPlan {
  const byKey = new Map<string, string>();
  for (const c of challenges) {
    if (!c.isGroup && !byKey.has(labelKey(c.label))) {
      byKey.set(labelKey(c.label), c.id);
    }
  }

  const reuse = new Map<string, string>();
  const create: LabelPlan["create"] = [];
  const planned = new Set<string>();
  for (const raw of labels) {
    const label = normalizeLabel(raw);
    const key = labelKey(label);
    if (!label) continue;
    const id = byKey.get(key);
    if (id) {
      reuse.set(key, id);
    } else if (!planned.has(key)) {
      planned.add(key);
      create.push({
        label,
        parentId: groupForLabel(label, challenges)?.id ?? null,
      });
    }
  }
  return { reuse, create };
}

type MembershipKey = { entryId: string; challengeId: string };

/**
 * The membership rows that follow from opt-ins: each opted-in challenge's
 * group, and every general challenge for every project. Rows that are
 * already opt-ins are left out, since the opt-in row covers them.
 */
export function derivedMemberships(
  optIns: readonly MembershipKey[],
  entryIds: readonly string[],
  challenges: readonly Pick<ChallengeRow, "id" | "parentId" | "isGeneral">[],
): MembershipKey[] {
  const byId = new Map(challenges.map((c) => [c.id, c]));
  const taken = new Set(optIns.map((m) => `${m.entryId}:${m.challengeId}`));
  const out: MembershipKey[] = [];
  const add = (entryId: string, challengeId: string) => {
    const key = `${entryId}:${challengeId}`;
    if (taken.has(key)) return;
    taken.add(key);
    out.push({ entryId, challengeId });
  };

  for (const optIn of optIns) {
    const parentId = byId.get(optIn.challengeId)?.parentId;
    if (parentId && byId.has(parentId)) add(optIn.entryId, parentId);
  }
  const general = challenges.filter((c) => c.isGeneral);
  for (const entryId of entryIds) {
    for (const challenge of general) add(entryId, challenge.id);
  }
  return out;
}

/**
 * Why `id` cannot sit under `parentId` with the given shape, or null when it
 * can. Groups hold plain challenges one level deep; a general challenge
 * covers every project and so stays at the top.
 */
export function groupingProblem(
  challenges: readonly Pick<ChallengeRow, "id" | "parentId" | "isGroup">[],
  child: { id: string | null; isGroup: boolean; isGeneral: boolean },
  parentId: string | null,
): string | null {
  if (parentId === null) return null;
  if (parentId === child.id) return "A challenge cannot sit inside itself.";
  const parent = challenges.find((c) => c.id === parentId);
  if (!parent) return "That group is not part of this hackathon.";
  if (!parent.isGroup) return "Only a group can hold challenges.";
  if (parent.parentId !== null) {
    return "Groups sit at the top level; pick a top-level group.";
  }
  if (child.isGroup) return "A group cannot sit inside another group.";
  if (child.isGeneral) {
    return "A general challenge covers every project, so it stays at the top level.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Database

// A function, not a constant: read at module load, the columns break every
// suite that mocks @query/db without the judging tables.
const challengeColumns = () => ({
  id: judgingChallenges.id,
  label: judgingChallenges.label,
  parentId: judgingChallenges.parentId,
  isGroup: judgingChallenges.isGroup,
  isGeneral: judgingChallenges.isGeneral,
  importLabelMatch: judgingChallenges.importLabelMatch,
  mode: judgingChallenges.mode,
});

/** The edition's challenges in display order. */
export function readChallenges(tx: JudgingDb, hackathonId: string) {
  return tx
    .select(challengeColumns())
    .from(judgingChallenges)
    .where(eq(judgingChallenges.hackathonId, hackathonId))
    .orderBy(
      asc(judgingChallenges.displayOrder),
      asc(judgingChallenges.createdAt),
      asc(judgingChallenges.id),
    );
}

/**
 * Creates the General and MLH Challenges groups, once per edition. A second
 * call is a no-op even after an organiser deleted them. If a group already
 * collects MLH labels, the starter one does not compete with it.
 */
export async function initializeGroups(
  tx: JudgingDb,
  hackathonId: string,
  config?: JudgingConfig,
): Promise<boolean> {
  const current = config ?? (await ensureJudgingConfig(tx, hackathonId));
  if (current.groupsInitializedAt) return false;

  const existing = await readChallenges(tx, hackathonId);
  const mlhTaken = existing.some(
    (c) => c.isGroup && c.importLabelMatch?.trim().toLowerCase() === "mlh",
  );

  await tx
    .insert(judgingChallenges)
    .values(
      STARTER_GROUPS.map((group) => ({
        ...group,
        hackathonId,
        importLabelMatch: mlhTaken ? null : group.importLabelMatch,
      })),
    )
    .onConflictDoNothing();

  const now = new Date();
  await tx
    .update(judgingConfigs)
    .set({ groupsInitializedAt: now, updatedAt: now })
    .where(eq(judgingConfigs.hackathonId, hackathonId));
  return true;
}

/**
 * The challenge id for each label, creating the ones not seen before.
 * Keyed by the label with case and spacing normalised.
 */
export async function resolveLabels(
  tx: JudgingDb,
  hackathonId: string,
  labels: readonly string[],
): Promise<{ ids: Map<string, string>; created: number }> {
  const plan = planLabels(labels, await readChallenges(tx, hackathonId));
  const ids = new Map(plan.reuse);
  if (plan.create.length > 0) {
    const inserted = await tx
      .insert(judgingChallenges)
      .values(plan.create.map((c) => ({ ...c, hackathonId })))
      .returning({ id: judgingChallenges.id, label: judgingChallenges.label });
    for (const row of inserted) ids.set(labelKey(row.label), row.id);
  }
  return { ids, created: plan.create.length };
}

/** Looks a label up in the map resolveLabels returned. */
export function idForLabel(ids: Map<string, string>, label: string) {
  return ids.get(labelKey(label));
}

/**
 * Recomputes the derived memberships (isOptIn = false) for some entries, or
 * every entry of the edition. Opt-in rows are never touched.
 */
export async function rebuildDerivedMemberships(
  tx: JudgingDb,
  hackathonId: string,
  entryIds?: readonly string[],
) {
  if (entryIds && entryIds.length === 0) return;

  const scopes = entryIds ? chunks(entryIds, 1000) : [null];
  const challenges = await readChallenges(tx, hackathonId);

  for (const scope of scopes) {
    const where = and(
      eq(judgingEntryChallenges.hackathonId, hackathonId),
      scope ? inArray(judgingEntryChallenges.entryId, scope) : undefined,
    );
    await tx
      .delete(judgingEntryChallenges)
      .where(and(where, eq(judgingEntryChallenges.isOptIn, false)));

    const optIns = await tx
      .select({
        entryId: judgingEntryChallenges.entryId,
        challengeId: judgingEntryChallenges.challengeId,
      })
      .from(judgingEntryChallenges)
      .where(where);

    const ids =
      scope ??
      (
        await tx
          .select({ id: judgingEntries.id })
          .from(judgingEntries)
          .where(eq(judgingEntries.hackathonId, hackathonId))
      ).map((row) => row.id);

    const derived = derivedMemberships(optIns, ids, challenges);
    for (const slice of chunks(derived, 1000)) {
      await tx
        .insert(judgingEntryChallenges)
        .values(
          slice.map((row) => ({ ...row, hackathonId, isOptIn: false })),
        )
        .onConflictDoNothing();
    }
  }
}
