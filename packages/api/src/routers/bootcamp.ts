import { z } from "zod";
import { and, asc, eq, inArray, isNotNull, desc } from "drizzle-orm";
import { eventCheckIns, events, members, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { currentTerm } from "@query/db/services/membership";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { isAdmin } from "../middleware/procedures";

/**
 * The bootcamp, read side. No bootcamp table: sessions are events carrying
 * `bootcampWeek`, attendance is the ordinary `event_check_in`. This pivots it
 * two ways — one member's weeks, and everybody against every week.
 *
 * Enrolment is `member.bootcampTerm === currentTerm()`, since a bootcamp is
 * sold by the semester and does not carry into the next one.
 */

const termInput = z
  .object({ term: z.string().trim().max(20).optional() })
  .optional();

/**
 * Named so both arms of `myProgress` return the same element type — a bare
 * `sessions: []` infers as `never[]` and breaks array methods for callers.
 */
type ProgressSession = Session & { attended: boolean; past: boolean };

type Session = {
  id: string;
  week: number | null;
  title: string;
  description: string | null;
  location: string | null;
  eventDate: Date;
  checkInEnabled: boolean;
};

/** The sessions of one bootcamp, in the order they are taught. */
async function sessionsForTerm(db: DrizzleDB, term: string): Promise<Session[]> {
  return db
    .select({
      id: events.id,
      week: events.bootcampWeek,
      title: events.title,
      description: events.description,
      location: events.location,
      eventDate: events.eventDate,
      checkInEnabled: events.checkInEnabled,
    })
    .from(events)
    .where(eq(events.bootcampTerm, term))
    .orderBy(asc(events.bootcampWeek));
}

export const bootcampRouter = createTRPCRouter({
  /**
   * The caller's own weeks. Not being enrolled reports `enrolled: false`
   * rather than throwing — it is the state the page turns into an upsell.
   */
  myProgress: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;
    const term = currentTerm();

    const member = await db.query.members.findFirst({
      where: eq(members.userId, ctx.userId as string),
      columns: { bootcampTerm: true },
    });

    const enrolled = member?.bootcampTerm === term;

    if (!enrolled) {
      return {
        enrolled: false as const,
        term,
        sessions: [] as ProgressSession[],
        attended: 0,
        held: 0,
      };
    }

    const sessions = await sessionsForTerm(db, term);

    const mine = sessions.length
      ? await db
          .select({ eventId: eventCheckIns.eventId })
          .from(eventCheckIns)
          .where(
            and(
              eq(eventCheckIns.userId, ctx.userId as string),
              inArray(
                eventCheckIns.eventId,
                sessions.map((session) => session.id),
              ),
            ),
          )
      : [];

    const attendedIds = new Set(mine.map((row) => row.eventId));
    const now = new Date();

    const withAttendance: ProgressSession[] = sessions.map((session) => ({
      ...session,
      attended: attendedIds.has(session.id),
      // Missed and not-yet-taught look identical in the data; only the clock
      // separates them.
      past: session.eventDate <= now,
    }));

    return {
      enrolled: true as const,
      term,
      sessions: withAttendance,
      attended: attendedIds.size,
      held: withAttendance.filter((session) => session.past).length,
    };
  }),

  /**
   * Everybody enrolled this term against every session. One procedure rather
   * than roster + grid + stats: they read the same three tables. Counts come
   * from the attendance rows, not `currentCheckIns`, so corrections show.
   */
  attendance: isAdmin.input(termInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const term = input?.term || currentTerm();

    // Attendance outlives its semester, so past terms stay reachable.
    const [sessions, roster, terms] = await Promise.all([
      sessionsForTerm(db, term),
      db
        .select({
          userId: members.userId,
          firstName: members.firstName,
          lastName: members.lastName,
          email: users.email,
          school: members.school,
        })
        .from(members)
        .innerJoin(users, eq(members.userId, users.id))
        .where(eq(members.bootcampTerm, term))
        .orderBy(asc(members.lastName), asc(members.firstName)),
      db
        .selectDistinct({ term: events.bootcampTerm })
        .from(events)
        .where(isNotNull(events.bootcampTerm))
        .orderBy(desc(events.bootcampTerm)),
    ]);

    const checkIns = sessions.length
      ? await db
          .select({
            eventId: eventCheckIns.eventId,
            userId: eventCheckIns.userId,
          })
          .from(eventCheckIns)
          .where(
            inArray(
              eventCheckIns.eventId,
              sessions.map((session) => session.id),
            ),
          )
      : [];

    const byUser = new Map<string, Set<string>>();
    const perSession = new Map<string, number>();
    for (const row of checkIns) {
      const seen = byUser.get(row.userId) ?? new Set<string>();
      seen.add(row.eventId);
      byUser.set(row.userId, seen);
      perSession.set(row.eventId, (perSession.get(row.eventId) ?? 0) + 1);
    }

    const now = new Date();
    const held = sessions.filter((session) => session.eventDate <= now);
    const totalAttendances = held.reduce(
      (sum, session) => sum + (perSession.get(session.id) ?? 0),
      0,
    );

    return {
      term,
      terms: terms.map((row) => row.term).filter((row): row is string => !!row),
      sessions: sessions.map((session) => ({
        ...session,
        attendance: perSession.get(session.id) ?? 0,
        past: session.eventDate <= now,
      })),
      members: roster.map((row) => {
        const attended = byUser.get(row.userId) ?? new Set<string>();
        return {
          ...row,
          name: `${row.firstName} ${row.lastName}`.trim(),
          attendedEventIds: [...attended],
          attendedCount: attended.size,
        };
      }),
      stats: {
        enrolled: roster.length,
        sessionsPlanned: sessions.length,
        sessionsHeld: held.length,
        // Held only, or the average drops every time one is scheduled.
        averageAttendance: held.length
          ? Math.round((totalAttendances / held.length) * 10) / 10
          : 0,
      },
    };
  }),
});
