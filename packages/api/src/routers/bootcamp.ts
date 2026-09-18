import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNotNull, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  bootcampWorkshops,
  eventCheckIns,
  events,
  members,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { currentTerm } from "@query/db/services/membership";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { isAdmin } from "../middleware/procedures";
import { isUniqueViolation } from "../middleware/db-errors";

// Sessions remain events and attendance remains `event_check_in`. Workshop
// rows hold only the material officers publish beside those sessions.

const termInput = z
  .object({ term: z.string().trim().max(20).optional() })
  .optional();

// Named so both arms of `myProgress` return the same element type — a bare
// `sessions: []` infers as `never[]` and breaks array methods for callers.
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

// Named so the not-enrolled `[]` has the same useful type as a database result.
type WorkshopRow = {
  id: string;
  term: string;
  week: number;
  title: string;
  materialsKey: string | null;
  materialsFileName: string | null;
  materialsSizeBytes: number | null;
  solutionKey: string | null;
  solutionFileName: string | null;
  solutionSizeBytes: number | null;
  recordingUrl: string | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  eventDate: Date | null;
  location: string | null;
};

// URL() accepts executable and local schemes, so workshop recordings use a
// positive web-scheme allowlist instead of treating `.url()` as sufficient.
const recordingUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Recording URL must use http or https");

const workshopFields = {
  id: bootcampWorkshops.id,
  term: bootcampWorkshops.term,
  week: bootcampWorkshops.week,
  title: bootcampWorkshops.title,
  materialsKey: bootcampWorkshops.materialsKey,
  materialsFileName: bootcampWorkshops.materialsFileName,
  materialsSizeBytes: bootcampWorkshops.materialsSizeBytes,
  solutionKey: bootcampWorkshops.solutionKey,
  solutionFileName: bootcampWorkshops.solutionFileName,
  solutionSizeBytes: bootcampWorkshops.solutionSizeBytes,
  recordingUrl: bootcampWorkshops.recordingUrl,
  isPublished: bootcampWorkshops.isPublished,
  createdAt: bootcampWorkshops.createdAt,
  updatedAt: bootcampWorkshops.updatedAt,
  eventDate: events.eventDate,
  location: events.location,
};

/** Workshop metadata joined to an optional meeting date by term and week. */
async function workshopsForTerm(
  db: DrizzleDB,
  term: string,
  publishedOnly: boolean,
): Promise<WorkshopRow[]> {
  const filters = [eq(bootcampWorkshops.term, term)];
  if (publishedOnly) filters.push(eq(bootcampWorkshops.isPublished, true));

  return db
    .select(workshopFields)
    .from(bootcampWorkshops)
    .leftJoin(
      events,
      and(
        eq(events.bootcampTerm, bootcampWorkshops.term),
        eq(events.bootcampWeek, bootcampWorkshops.week),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(bootcampWorkshops.week));
}

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
  // The caller's own weeks. Not being enrolled reports `enrolled: false` rather
  // than throwing — it is the state the page turns into an upsell.
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

  // The caller's own cohort, not the current one: whoever bought the fall
  // bootcamp keeps its material in January. Not being enrolled is ordinary
  // page state, not an authorization error.
  workshops: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;
    const member = await db.query.members.findFirst({
      where: eq(members.userId, ctx.userId as string),
      columns: { bootcampTerm: true },
    });

    if (!member?.bootcampTerm) return [] as WorkshopRow[];
    return workshopsForTerm(db, member.bootcampTerm, true);
  }),

  // Staff can inspect drafts and past terms while preparing or correcting a
  // cohort; unlike member reads this intentionally does not force currentTerm.
  adminWorkshops: isAdmin.input(termInput).query(async ({ ctx, input }) => {
    return workshopsForTerm(
      ctx.db as DrizzleDB,
      input?.term || currentTerm(),
      false,
    );
  }),

  createWorkshop: isAdmin
    .input(
      z.object({
        week: z.number().int().min(1).max(52),
        title: z.string().trim().min(1).max(200),
        recordingUrl: recordingUrl.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await (ctx.db as DrizzleDB)
        .insert(bootcampWorkshops)
        .values({ ...input, term: currentTerm() })
        .returning()
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Week ${input.week} of this bootcamp already has workshop material. Edit that row instead.`,
            });
          }
          throw error;
        });

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Workshop could not be created",
        });
      }
      return created;
    }),

  updateWorkshop: isAdmin
    .input(
      z.object({
        workshopId: z.string().uuid(),
        // No week: the session joins on (term, week), so moving a row would
        // leave its session behind. Delete and recreate to renumber.
        title: z.string().trim().min(1).max(200).optional(),
        recordingUrl: recordingUrl.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { workshopId, ...fields } = input;
      const [updated] = await (ctx.db as DrizzleDB)
        .update(bootcampWorkshops)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(bootcampWorkshops.id, workshopId))
        .returning()
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Another workshop row already uses that week.",
            });
          }
          throw error;
        });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workshop not found",
        });
      }
      return updated;
    }),

  // Called only when the officer changed the date or location, so saving a
  // TBA workshop never touches an event. Term and week come from the row,
  // not the clock, so editing a past cohort cannot reach the current one.
  upsertSession: isAdmin
    .input(
      z.object({
        workshopId: z.string().uuid(),
        sessionDate: z.date().nullable(),
        location: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const workshop = await db.query.bootcampWorkshops.findFirst({
        where: eq(bootcampWorkshops.id, input.workshopId),
        columns: { term: true, week: true, title: true },
      });
      if (!workshop) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workshop not found" });
      }
      const { term, week } = workshop;
      // Omitted means untouched: a title or room set on the events screen
      // survives a workshop edit.
      const location =
        input.location === undefined ? {} : { location: input.location || null };

      if (input.sessionDate === null) {
        // Clearing keeps the event, QR code, and check-ins; only its bootcamp
        // association is removed so the workshop honestly returns to TBA.
        const [detached] = await db
          .update(events)
          .set({
            bootcampWeek: null,
            bootcampTerm: null,
            bootcampOnly: false,
            updatedAt: new Date(),
          })
          .where(and(eq(events.bootcampWeek, week), eq(events.bootcampTerm, term)))
          .returning();

        ctx.cache.deletePattern("event*");
        return detached ?? null;
      }

      // The QR is insert-only: omitting it from the conflict update preserves
      // printed signs when staff reschedule an existing session.
      const [session] = await db
        .insert(events)
        .values({
          title: workshop.title,
          location: input.location || null,
          eventDate: input.sessionDate,
          qrCode: randomUUID(),
          createdById: ctx.userId as string,
          bootcampWeek: week,
          bootcampTerm: term,
          bootcampOnly: true,
        })
        .onConflictDoUpdate({
          target: [events.bootcampWeek, events.bootcampTerm],
          set: {
            ...location,
            eventDate: input.sessionDate,
            bootcampOnly: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!session) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Bootcamp session could not be saved",
        });
      }

      ctx.cache.deletePattern("event*");
      return session;
    }),

  // Publishing stays separate from editing so uploads can finish before a row
  // becomes visible, and an upload failure cannot accidentally expose it.
  setPublished: isAdmin
    .input(
      z.object({ workshopId: z.string().uuid(), isPublished: z.boolean() }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await (ctx.db as DrizzleDB)
        .update(bootcampWorkshops)
        .set({ isPublished: input.isPublished, updatedAt: new Date() })
        .where(eq(bootcampWorkshops.id, input.workshopId))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workshop not found",
        });
      }
      return updated;
    }),

  // Everybody enrolled this term against every session. One procedure rather
  // than roster + grid + stats: they read the same three tables. Counts come
  // from the attendance rows, not `currentCheckIns`, so corrections show.
  attendance: isAdmin.input(termInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const term = input?.term || currentTerm();

    // Attendance outlives its semester, so past terms stay reachable.
    const [sessions, roster, eventTerms, workshopTerms] = await Promise.all([
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
      db
        .selectDistinct({ term: bootcampWorkshops.term })
        .from(bootcampWorkshops)
        .orderBy(desc(bootcampWorkshops.term)),
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
      // A term with files but no event rows must still be selectable.
      terms: [...new Set([...eventTerms, ...workshopTerms].map((row) => row.term))]
        .filter((row): row is string => !!row)
        .sort()
        .reverse(),
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
