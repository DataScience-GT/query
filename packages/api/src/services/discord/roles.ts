// Who may link Discord, and what Discord is told about them. One typed model
// for the three roles instead of booleans repeated across the router, the link
// flow and the portal. See docs/features/discord.md.

import type { DrizzleDB } from "@query/db";
import { isExpiredAdmin } from "../../types/portal-context";

/** One person can hold several of these at once. */
export type DiscordRoles = {
  /** Accepted and said "I'm coming" (or already checked in). */
  hacker: boolean;
  /** An approved judge of the edition. */
  judge: boolean;
  /** Event staff of the volunteer tier, while an edition is open or live. */
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

/** The roles one person holds in one edition, from what the database says. */
export function rolesFor(input: {
  participant: {
    registrationStatus: string | null | undefined;
    attendanceConfirmedAt: Date | null | undefined;
  } | null;
  judge: boolean;
  volunteer: boolean;
  hackathonStatus: string;
}): DiscordRoles {
  return {
    hacker: !!input.participant && isConfirmedHacker(input.participant),
    judge: input.judge,
    volunteer: input.volunteer && isVolunteerEdition(input.hackathonStatus),
  };
}

/**
 * What the Linked Roles PUT carries. `accepted` is 1 only for confirmed
 * hackers. `food_group` and `ramadan` are hackers' alone and left out
 * otherwise. `judge` and `volunteer` are always sent, 1 or 0, so a role that
 * no longer applies is cleared the next time the person updates their roles.
 */
export function roleMetadata(
  roles: DiscordRoles,
  hacker: { foodGroup: number; ramadan: 0 | 1 } | null,
) {
  return {
    accepted: roles.hacker ? 1 : 0,
    ...(roles.hacker && hacker
      ? { food_group: hacker.foodGroup, ramadan: hacker.ramadan }
      : {}),
    judge: roles.judge ? 1 : 0,
    volunteer: roles.volunteer ? 1 : 0,
  };
}

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
    const [participant, judge, volunteer] = await Promise.all([
      db.query.hackathonParticipants.findFirst({
        where: { hackathonId, userId },
        columns: PARTICIPANT_COLUMNS,
      }),
      db.query.judges.findFirst({
        where: { hackathonId, userId, isActive: true },
        columns: { id: true },
      }),
      isVolunteer(db, userId),
    ]);
    return {
      hackathon: { id: hackathon.id, name: hackathon.name },
      participant: participant ?? null,
      roles: rolesFor({
        participant: participant ?? null,
        judge: !!judge,
        volunteer,
        hackathonStatus: hackathon.status,
      }),
    };
  }

  const volunteer = await isVolunteer(db, userId);
  const [participants, judgeRows, openEditions] = await Promise.all([
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
    volunteer
      ? db.query.hackathons.findMany({
          where: { status: { in: [...VOLUNTEER_EDITION_STATUSES] } },
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
  for (const edition of openEditions) entry(edition);

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
            volunteer,
            hackathonStatus: edition.status,
          }),
        } satisfies DiscordContext,
      }))
      .filter(({ context }) => hasDiscordRole(context.roles))
      .sort((a, b) => b.start - a.start)[0]?.context ?? null
  );
}
