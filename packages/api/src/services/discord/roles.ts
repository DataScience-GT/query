// Who may link Discord, and what Discord is told about them. One typed model
// for the three roles instead of booleans repeated across the router, the link
// flow and the portal. See docs/features/discord.md.

import type { DrizzleDB } from "@query/db";
import { isExpiredAdmin } from "../../types/portal-context";
import { approvedVolunteerEditions } from "../volunteer";
import { foodGroupByKey } from "./config";
import { ensureFoodGroup } from "./food-group";

/** One person can hold several of these at once. */
export type DiscordRoles = {
  /** Accepted and said "I'm coming" (or already checked in). */
  hacker: boolean;
  /** An approved judge of the edition. */
  judge: boolean;
  /**
   * Event staff of the volunteer tier while an edition is open or live, or a
   * volunteer an organizer approved for the edition.
   */
  volunteer: boolean;
};

export const NO_ROLES: DiscordRoles = {
  hacker: false,
  judge: false,
  volunteer: false,
};

export const hasDiscordRole = (roles: DiscordRoles) =>
  roles.hacker || roles.judge || roles.volunteer;

/** Accepted: seated, whether or not they have said they are coming. */
export const isAcceptedHacker = (status: string | null | undefined) =>
  status === "approved" || status === "checked_in";

/**
 * A hacker earns the Discord step by answering "I'm coming" on the hackathon
 * Overview. Being accepted alone is not enough. Checked in counts without the
 * answer: they are in the building.
 */
export const isConfirmedHacker = (p: {
  registrationStatus: string | null | undefined;
  attendanceConfirmedAt: Date | null | undefined;
}) =>
  p.registrationStatus === "checked_in" ||
  (p.registrationStatus === "approved" && !!p.attendanceConfirmedAt);

/**
 * Volunteers are org-wide staff, not tied to one edition, so they qualify for
 * any edition that is open or live: registration has opened and the event is
 * not over. Not a draft, an announcement, a finished or a cancelled edition.
 */
export const VOLUNTEER_EDITION_STATUSES = [
  "open",
  "closed",
  "in_progress",
] as const;

const isVolunteerEdition = (status: string) =>
  (VOLUNTEER_EDITION_STATUSES as readonly string[]).includes(status);

/**
 * An approved volunteer application is for one edition and is taken from the
 * announcement on, since that is when applications open. Not a draft, a
 * finished or a cancelled edition.
 */
const isApplicantEdition = (status: string) =>
  status === "announced" || isVolunteerEdition(status);

/** The volunteer staff tier is what opens the check-in desk. */
const holdsDesk = (staff: boolean, hackathonStatus: string) =>
  staff && isVolunteerEdition(hackathonStatus);

/** The roles one person holds in one edition, from what the database says. */
export function rolesFor(input: {
  participant: {
    registrationStatus: string | null | undefined;
    attendanceConfirmedAt: Date | null | undefined;
  } | null;
  judge: boolean;
  /** An active, unexpired volunteer staff tier. */
  staff: boolean;
  /** An approved volunteer application for this edition. */
  approvedVolunteer: boolean;
  hackathonStatus: string;
}): DiscordRoles {
  return {
    hacker: !!input.participant && isConfirmedHacker(input.participant),
    judge: input.judge,
    volunteer:
      holdsDesk(input.staff, input.hackathonStatus) ||
      (input.approvedVolunteer && isApplicantEdition(input.hackathonStatus)),
  };
}

/** What the Linked Roles PUT carries: always all five registered fields. */
export type RoleMetadata = {
  accepted: 0 | 1;
  food_group: number;
  ramadan: 0 | 1;
  judge: 0 | 1;
  volunteer: 0 | 1;
};

/** Every field cleared: what Discord is told for someone who holds no role. */
export const ZERO_METADATA: RoleMetadata = {
  accepted: 0,
  food_group: 0,
  ramadan: 0,
  judge: 0,
  volunteer: 0,
};

/**
 * What the Linked Roles PUT carries. `accepted` is 1 only for confirmed
 * hackers; `food_group` and `ramadan` are a hacker's alone and 0 otherwise (no
 * flower role matches 0). `judge` and `volunteer` are 1 or 0. All five are
 * always sent, so a role that no longer applies is overwritten, not left behind.
 */
export function roleMetadata(
  roles: DiscordRoles,
  hacker: { foodGroup: number; ramadan: 0 | 1 } | null,
): RoleMetadata {
  const asHacker = roles.hacker && hacker ? hacker : null;
  return {
    accepted: roles.hacker ? 1 : 0,
    food_group: asHacker?.foodGroup ?? 0,
    ramadan: asHacker?.ramadan ?? 0,
    judge: roles.judge ? 1 : 0,
    volunteer: roles.volunteer ? 1 : 0,
  };
}

/**
 * The metadata last published, as a short string, kept on the link. It tells a
 * sync whether anything changed, and lets the daily job find volunteers whose
 * published `volunteer` is still 1 (the string ends in `v1`).
 */
export const roleSignature = (m: RoleMetadata) =>
  `a${m.accepted}f${m.food_group}r${m.ramadan}j${m.judge}v${m.volunteer}`;

/** The Ramadan flag Discord receives: opted in AND fasting is "Yes". */
export const ramadanFlag = (optIn: boolean, fasting: string | null | undefined) =>
  optIn && fasting === "Yes" ? 1 : 0;

export type DiscordParticipant = {
  id: string;
  registrationStatus: string;
  attendanceConfirmedAt: Date | null;
  foodGroup: string | null;
  ramadanFasting: string | null;
  ramadanRoleOptIn: boolean | null;
  discordUserId: string | null;
  discordUsername: string | null;
  discordLinkedAt: Date | null;
};

export type DiscordContext = {
  hackathon: { id: string; name: string };
  participant: DiscordParticipant | null;
  roles: DiscordRoles;
  /** Volunteer through the staff tier, so the check-in desk is theirs. */
  deskStaff: boolean;
};

const PARTICIPANT_COLUMNS = {
  id: true,
  registrationStatus: true,
  attendanceConfirmedAt: true,
  foodGroup: true,
  ramadanFasting: true,
  ramadanRoleOptIn: true,
  discordUserId: true,
  discordUsername: true,
  discordLinkedAt: true,
} as const;

const HACKATHON_COLUMNS = {
  id: true,
  name: true,
  status: true,
  startDate: true,
} as const;

type Edition = { id: string; name: string; status: string; startDate: Date };

/** An active, unexpired admin row of the volunteer tier. */
async function isVolunteer(db: DrizzleDB, userId: string): Promise<boolean> {
  const admin = await db.query.admins.findFirst({
    where: { userId, isActive: true, role: "volunteer" },
    columns: { expiresAt: true },
  });
  return !!admin && !isExpiredAdmin(admin);
}

/**
 * Everything the Discord step knows about one person for one edition. With a
 * hackathon id, that edition, even when they hold no role there (the portal
 * still shows a hacker who has not confirmed). Without one, which is what
 * Discord's Linked Roles verification URL sends, the newest edition that is
 * not cancelled or over in which they hold a role. Null when there is none.
 */
export async function discordContext(
  db: DrizzleDB,
  userId: string,
  hackathonId: string | null,
): Promise<DiscordContext | null> {
  if (hackathonId) {
    const hackathon = await db.query.hackathons.findFirst({
      where: { id: hackathonId },
      columns: HACKATHON_COLUMNS,
    });
    if (!hackathon) return null;
    const [participant, judge, staff, approved] = await Promise.all([
      db.query.hackathonParticipants.findFirst({
        where: { hackathonId, userId },
        columns: PARTICIPANT_COLUMNS,
      }),
      db.query.judges.findFirst({
        where: { hackathonId, userId, isActive: true },
        columns: { id: true },
      }),
      isVolunteer(db, userId),
      approvedVolunteerEditions(db, userId, hackathonId),
    ]);
    return {
      hackathon: { id: hackathon.id, name: hackathon.name },
      participant: participant ?? null,
      roles: rolesFor({
        participant: participant ?? null,
        judge: !!judge,
        staff,
        approvedVolunteer: approved.length > 0,
        hackathonStatus: hackathon.status,
      }),
      deskStaff: holdsDesk(staff, hackathon.status),
    };
  }

  const [staff, approvedIds] = await Promise.all([
    isVolunteer(db, userId),
    approvedVolunteerEditions(db, userId),
  ]);
  const [participants, judgeRows, volunteerEditions] = await Promise.all([
    db.query.hackathonParticipants.findMany({
      where: { userId },
      columns: PARTICIPANT_COLUMNS,
      with: { hackathon: { columns: HACKATHON_COLUMNS } },
    }),
    db.query.judges.findMany({
      where: { userId, isActive: true },
      columns: { id: true },
      with: { hackathon: { columns: HACKATHON_COLUMNS } },
    }),
    // The editions a volunteer qualifies for: every open or live one for the
    // staff tier, the ones they were approved for as an applicant.
    staff || approvedIds.length > 0
      ? db.query.hackathons.findMany({
          where: {
            OR: [
              ...(staff
                ? [{ status: { in: [...VOLUNTEER_EDITION_STATUSES] } }]
                : []),
              ...(approvedIds.length > 0 ? [{ id: { in: approvedIds } }] : []),
            ],
          },
          columns: HACKATHON_COLUMNS,
        })
      : Promise.resolve([] as Edition[]),
  ]);

  const editions = new Map<
    string,
    { edition: Edition; participant: DiscordParticipant | null; judge: boolean }
  >();
  const entry = (edition: Edition) => {
    let held = editions.get(edition.id);
    if (!held) {
      held = { edition, participant: null, judge: false };
      editions.set(edition.id, held);
    }
    return held;
  };
  for (const { hackathon, ...participant } of participants) {
    if (hackathon) entry(hackathon).participant = participant;
  }
  for (const { hackathon } of judgeRows) {
    if (hackathon) entry(hackathon).judge = true;
  }
  for (const edition of volunteerEditions) entry(edition);

  return (
    [...editions.values()]
      .filter(
        ({ edition }) =>
          edition.status !== "cancelled" && edition.status !== "completed",
      )
      .map(({ edition, participant, judge }) => ({
        start: new Date(edition.startDate).getTime(),
        context: {
          hackathon: { id: edition.id, name: edition.name },
          participant,
          roles: rolesFor({
            participant,
            judge,
            staff,
            approvedVolunteer: approvedIds.includes(edition.id),
            hackathonStatus: edition.status,
          }),
          deskStaff: holdsDesk(staff, edition.status),
        } satisfies DiscordContext,
      }))
      .filter(({ context }) => hasDiscordRole(context.roles))
      .sort((a, b) => b.start - a.start)[0]?.context ?? null
  );
}

/**
 * A confirmed hacker's flower number and Ramadan flag, or null for anyone else.
 * `ramadanOptIn` is the choice made in this flow; null keeps the stored one.
 * The flower is assigned first if they have none, so the metadata always has one.
 */
export async function hackerPayload(
  db: DrizzleDB,
  context: DiscordContext,
  ramadanOptIn: boolean | null,
): Promise<{ foodGroup: number; ramadan: 0 | 1 } | null> {
  const { participant, roles, hackathon } = context;
  if (!roles.hacker || !participant) return null;
  const group =
    foodGroupByKey(participant.foodGroup) ??
    foodGroupByKey(await ensureFoodGroup(db, hackathon.id, participant.id));
  return {
    foodGroup: group?.number ?? 0,
    ramadan: ramadanFlag(
      ramadanOptIn ?? participant.ramadanRoleOptIn ?? false,
      participant.ramadanFasting,
    ),
  };
}
