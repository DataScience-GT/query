import { db, events } from "@query/db";
import { and, eq, isNotNull } from "drizzle-orm";

// qrCode is deliberately absent: publishing it would let anyone check
// themselves in without being in the room.
const listedColumns = {
  id: true,
  title: true,
  location: true,
  eventDate: true,
  bootcampWeek: true,
} as const;

export async function loadBootcampSessions(term: string) {
  if (!db) return [];

  // Same as /events: an unreachable database renders the empty state instead
  // of failing the build or the revalidation.
  try {
    return await db.query.events.findMany({
      where: and(
        eq(events.bootcampTerm, term),
        isNotNull(events.bootcampWeek),
      ),
      orderBy: (event, { asc }) => [asc(event.eventDate)],
      limit: 30,
      columns: listedColumns,
    });
  } catch (error) {
    console.error("Failed to load bootcamp sessions", error);
    return [];
  }
}

export type BootcampSession = Awaited<
  ReturnType<typeof loadBootcampSessions>
>[number];
