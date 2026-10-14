import { and, count, eq, inArray, isNull } from "drizzle-orm";
import {
  judgingAppointments,
  judgingGuestSessions,
  judgingPresence,
  judgingRoomLinks,
} from "@query/db";
import { lockInventory } from "./config";
import type { JudgingDb } from "./config";
import { roomLinkPath } from "./room-link";

// Room QR links. A room has at most one live link; issuing a new one retires
// the old, and retiring a link signs out every guest who came in through it.

const FALLBACK_ORIGIN = "https://datasciencegt.org";

/**
 * Where the portal is served, for links that leave the app: printed QR codes
 * outlive the request that made them, so the configured site URL wins over
 * whatever host the organiser happened to use.
 */
export function portalOrigin(req?: Request): string {
  const configured = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (configured) return new URL(configured).origin;
  if (req) return new URL(req.url).origin;
  return FALLBACK_ORIGIN;
}

/** The absolute URL a room's QR code encodes. */
export function roomLinkUrl(linkId: string, origin: string): string {
  return new URL(roomLinkPath(linkId), origin).toString();
}

export type RevokedAccess = {
  links: number;
  sessions: number;
  presence: number;
};

/**
 * Retires the live link of one room, or of every room in the edition, and
 * ends the guest sessions in those rooms along with their seats. Member
 * judges keep their seats: they signed in, and the link was only their way
 * to the room.
 */
export async function revokeRoomAccess(
  tx: JudgingDb,
  scope: { hackathonId: string; roomId?: string },
  userId: string | null,
): Promise<RevokedAccess> {
  const now = new Date();

  const links = await tx
    .update(judgingRoomLinks)
    .set({ revokedAt: now, revokedById: userId })
    .where(
      and(
        eq(judgingRoomLinks.hackathonId, scope.hackathonId),
        scope.roomId ? eq(judgingRoomLinks.roomId, scope.roomId) : undefined,
        isNull(judgingRoomLinks.revokedAt),
      ),
    )
    .returning({ id: judgingRoomLinks.id });

  // By room rather than by the links just retired, so a session that
  // outlived an earlier revocation is caught too.
  const sessions = await tx
    .update(judgingGuestSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(judgingGuestSessions.hackathonId, scope.hackathonId),
        scope.roomId
          ? eq(judgingGuestSessions.roomId, scope.roomId)
          : undefined,
        isNull(judgingGuestSessions.revokedAt),
      ),
    )
    .returning({ judgeId: judgingGuestSessions.judgeId });

  const judgeIds = [
    ...new Set(
      sessions
        .map((session) => session.judgeId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const presence =
    judgeIds.length > 0
      ? await tx
          .update(judgingPresence)
          .set({ leftAt: now })
          .where(
            and(
              inArray(judgingPresence.judgeId, judgeIds),
              isNull(judgingPresence.leftAt),
            ),
          )
          .returning({ id: judgingPresence.id })
      : [];

  return {
    links: links.length,
    sessions: sessions.length,
    presence: presence.length,
  };
}

/**
 * Replaces a room's link with a fresh one. The first link anywhere locks the
 * project inventory: from then on a Devpost import only adds projects.
 */
export async function issueRoomLink(
  tx: JudgingDb,
  room: { id: string; hackathonId: string },
  userId: string,
) {
  const revoked = await revokeRoomAccess(
    tx,
    { hackathonId: room.hackathonId, roomId: room.id },
    userId,
  );
  const [link] = await tx
    .insert(judgingRoomLinks)
    .values({
      roomId: room.id,
      hackathonId: room.hackathonId,
      createdById: userId,
    })
    .returning({ id: judgingRoomLinks.id, createdAt: judgingRoomLinks.createdAt });
  await lockInventory(tx, room.hackathonId, userId);
  return { link: link!, revoked };
}

/** Everyone still seated in a room stands up, members included. */
export async function emptyRoom(tx: JudgingDb, roomId: string) {
  const rows = await tx
    .update(judgingPresence)
    .set({ leftAt: new Date() })
    .where(
      and(eq(judgingPresence.roomId, roomId), isNull(judgingPresence.leftAt)),
    )
    .returning({ id: judgingPresence.id });
  return rows.length;
}

/** A judging table's name: "Table 7". */
export const tableName = (number: number) => `Table ${number}`;

/** The highest table number createTables hands out. */
export const MAX_TABLE_NUMBER = 9999;

/**
 * The number in a "Table 7" name, or null for any other name. A number past
 * MAX_TABLE_NUMBER reads as a plain name, so a hand-typed "Table 20000"
 * cannot push the next blank-start batch out of range.
 */
export function tableNumber(name: string): number | null {
  const match = /^table\s+(\d+)$/i.exec(name.trim());
  const number = match ? Number(match[1]) : null;
  return number !== null && number <= MAX_TABLE_NUMBER ? number : null;
}

type HallStation = { name: string; archived: boolean };

/**
 * Where a hall's numbering goes on: one past its highest "Table N", archived
 * tables included so a new table never shares a number with one that could
 * come back.
 */
export function nextTableNumber(stations: readonly HallStation[]): number {
  let highest = 0;
  for (const station of stations) {
    highest = Math.max(highest, tableNumber(station.name) ?? 0);
  }
  return highest + 1;
}

/**
 * The numbers to create for `count` tables starting at `first`, less those an
 * active station in the hall already goes by. A skipped number is not made
 * up at the end: the run matches the numbers on the tables in the hall.
 */
export function newTableNumbers(
  stations: readonly HallStation[],
  count: number,
  first = nextTableNumber(stations),
): number[] {
  const taken = new Set(
    stations
      .filter((station) => !station.archived)
      .map((station) => tableNumber(station.name)),
  );
  const numbers: number[] = [];
  for (let number = first; number < first + count; number++) {
    if (!taken.has(number)) numbers.push(number);
  }
  return numbers;
}

/**
 * The edition's station list with new tables slotted in by number. `number`
 * is set only on the hall's tables. Each new table goes after the hall's
 * highest-numbered table below it, else before its lowest above it, else at
 * the end, so a Table 12 added later lists between 11 and 13, not after 30.
 */
export function slotTables<T extends { number: number | null }>(
  order: readonly T[],
  added: readonly (T & { number: number })[],
): T[] {
  const list = [...order];
  for (const table of added) {
    let after = -1;
    let afterNumber = -Infinity;
    let before = list.length;
    let beforeNumber = Infinity;
    list.forEach(({ number }, index) => {
      if (number === null) return;
      if (number < table.number && number > afterNumber) {
        after = index;
        afterNumber = number;
      }
      if (number > table.number && number < beforeNumber) {
        before = index;
        beforeNumber = number;
      }
    });
    list.splice(after >= 0 ? after + 1 : before, 0, table);
  }
  return list;
}

/** How many scheduled presentations a room hosts. */
export async function roomAppointmentCount(tx: JudgingDb, roomId: string) {
  const [row] = await tx
    .select({ value: count() })
    .from(judgingAppointments)
    .where(eq(judgingAppointments.roomId, roomId));
  return row?.value ?? 0;
}
