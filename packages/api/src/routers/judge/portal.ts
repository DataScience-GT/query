import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { judges, judgeAssignments } from "@query/db";
import { and, eq } from "drizzle-orm";
import { CacheKeys } from "../../middleware/cache";
import { notHackathonBanned } from "../../middleware/procedures";
import { resolveHackathonId } from "../../services/portal-context";
import type { DrizzleDB } from "@query/db";

// The track a judge would like, as the edition spells it. Organisers read it
// when seating judges, so a free-text value that matches none of the edition's
// labels would only be noise. "createX" is a label the submit form offers.
async function assertTrackExists(
  db: DrizzleDB,
  hackathonId: string,
  track: string | null | undefined,
): Promise<string | null> {
  if (!track) return null;

  const hackathon = await db.query.hackathons.findFirst({
    where: { id: hackathonId },
    columns: { tracks: true, challenges: true },
  });

  const allowed = [
    ...(hackathon?.tracks ?? []),
    ...(hackathon?.challenges ?? []),
    "createX",
  ];

  // Case-insensitive match, but the stored value is the edition's own spelling.
  const match = allowed.find(
    (t) => t.toLowerCase() === track.trim().toLowerCase(),
  );

  if (!match) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        allowed.length === 1
          ? "This hackathon has no tracks or challenges configured yet. Leave the track empty and an organizer will place you."
          : `"${track}" is not a track or challenge on this hackathon. Choose one of: ${allowed.join(", ")}.`,
    });
  }

  return match;
}

// An application can be corrected until the edition is over.
async function assertEditionNotOver(db: DrizzleDB, hackathonId: string) {
  const hackathon = await db.query.hackathons.findFirst({
    where: { id: hackathonId },
    columns: { status: true, endDate: true },
  });
  if (
    !hackathon ||
    !["announced", "open", "closed", "in_progress"].includes(hackathon.status) ||
    (hackathon.endDate && new Date() > new Date(hackathon.endDate))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This hackathon is over, so applications can't be edited.",
    });
  }
}

// The application form. Shared by register and updateMyApplication so an edit
// is held to exactly the rules the first submission was.
const applicationFields = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  specialty: z.string().max(200).optional(),
  linkedinUrl: z.string().url().max(500).optional().or(z.literal("")),
  githubUrl: z.string().url().max(500).optional().or(z.literal("")),
  previousExperience: z.string().trim().min(1).max(2000),
  dietaryRestrictions: z.array(z.string()).optional(),
  shirtSize: z.string().optional(),
  canAttendInPerson: z.boolean(),
  whyJudge: z.string().trim().min(1).max(2000),
  preferredTrack: z.string().optional(),
});

// The judge's own side of the roster: am I a judge, what have I applied to,
// and the application itself.
export const judgePortalRouter = createTRPCRouter({
  isJudge: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // The platform's single definition of the current edition; ordering by
      // start date alone picks next year's draft.
      const hackathonId = await resolveHackathonId(
        ctx.db as DrizzleDB,
        input?.hackathonId,
      );

      if (!hackathonId) {
        return {
          isJudge: false,
          judgeId: null,
          name: null,
          hackathonId: null,
        };
      }

      const cacheKey = `${CacheKeys.judge(ctx.userId as string)}:${hackathonId}`;
      const cached = ctx.cache.get<{
        isJudge: boolean;
        judgeId: string | null;
        name: string | null;
        hackathonId: string | null;
      }>(cacheKey);
      if (cached) return cached;

      const judge = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: {
          userId: ctx.userId as string,
          hackathonId,
          isActive: true,
        },
      });

      const result = {
        isJudge: !!judge,
        judgeId: judge?.id || null,
        name: judge?.name || null,
        // Which edition the answer is for, since the caller may not have named one.
        hackathonId,
      };
      ctx.cache.set(cacheKey, result, 60);

      return result;
    }),

  // Every judging application this user has made, approved or not, so an
  // applicant waiting on approval still has a status to look at.
  myApplications: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    const myJudges = await db.query.judges.findMany({
      where: { userId: ctx.userId as string },
      columns: {
        id: true,
        hackathonId: true,
        isActive: true,
        createdAt: true,
        canAttendInPerson: true,
      },
    });

    if (myJudges.length === 0) return [];

    const rows = await db.query.judgeAssignments.findMany({
      where: { judgeId: { in: myJudges.map((j) => j.id) } },
      columns: { judgeId: true, hackathonId: true, track: true, assignedAt: true },
    });

    const activeById = new Map(myJudges.map((j) => [j.id, j.isActive]));
    const attendById = new Map(
      myJudges.map((j) => [j.id, j.canAttendInPerson]),
    );
    const applied = new Set(rows.map((row) => row.judgeId));

    return [
      ...rows.map((row) => ({
        hackathonId: row.hackathonId,
        track: row.track,
        appliedAt: row.assignedAt,
        // The judges row is what every judging gate reads, so it — not the
        // assignment's own status column — decides this.
        approved: activeById.get(row.judgeId) === true,
        // Null for a judge who applied before the question existed.
        canAttendInPerson: attendById.get(row.judgeId) ?? null,
      })),
      // An organiser who adds a judge directly writes the judges row and no
      // assignment. Without these the register page offered that judge the
      // form again, and submitting it overwrote their row.
      ...myJudges
        .filter((judge) => !applied.has(judge.id))
        .map((judge) => ({
          hackathonId: judge.hackathonId,
          track: null,
          appliedAt: judge.createdAt,
          approved: judge.isActive,
          canAttendInPerson: judge.canAttendInPerson,
        })),
    ];
  }),

  register: notHackathonBanned
    .input(applicationFields.extend({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Only an edition people can see and that is not over takes judges. Any
        // uuid used to pass, and one that did not exist hit the foreign key as
        // a 500. Announced counts: judges are recruited before registration.
        const hackathon = await tx.query.hackathons.findFirst({
          where: { id: input.hackathonId },
          columns: { isPublic: true, status: true },
        });
        if (
          !hackathon ||
          !hackathon.isPublic ||
          !["announced", "open", "closed", "in_progress"].includes(
            hackathon.status,
          )
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That hackathon is not taking judge applications.",
          });
        }

        const participant = await tx.query.hackathonParticipants.findFirst({
          where: {
            hackathonId: input.hackathonId,
            userId: ctx.userId as string,
          },
        });

        if (participant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "You cannot apply to be a judge because you are registered as a participant for this hackathon.",
          });
        }

        let judge = await tx.query.judges.findFirst({
          where: { userId: ctx.userId, hackathonId: input.hackathonId },
        });

        if (judge) {
          await tx
            .update(judges)
            .set({
              name: input.name,
              email: input.email,
              phone: input.phone,
              company: input.company,
              title: input.title,
              specialty: input.specialty,
              linkedinUrl: input.linkedinUrl,
              githubUrl: input.githubUrl,
              previousExperience: input.previousExperience,
              dietaryRestrictions: input.dietaryRestrictions || [],
              shirtSize: input.shirtSize,
              canAttendInPerson: input.canAttendInPerson,
              whyJudge: input.whyJudge,
            })
            .where(eq(judges.id, judge.id));
        } else {
          const inserted = await tx
            .insert(judges)
            .values({
              userId: ctx.userId,
              hackathonId: input.hackathonId,
              name: input.name,
              email: input.email,
              phone: input.phone,
              company: input.company,
              title: input.title,
              specialty: input.specialty,
              linkedinUrl: input.linkedinUrl || null,
              githubUrl: input.githubUrl || null,
              previousExperience: input.previousExperience,
              dietaryRestrictions: input.dietaryRestrictions || [],
              shirtSize: input.shirtSize,
              canAttendInPerson: input.canAttendInPerson,
              whyJudge: input.whyJudge,
              isActive: false, // Must be approved by admin
            })
            .returning();
          judge = inserted[0];
        }

        if (!judge)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create judge profile",
          });

        // The application itself: one per judge per edition, carrying the
        // preferred track.
        const existingAssignment = await tx.query.judgeAssignments.findFirst({
          where: { judgeId: judge.id, hackathonId: input.hackathonId },
        });

        if (existingAssignment) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You have already applied to judge this hackathon.",
          });
        }

        const track = await assertTrackExists(
          tx as unknown as DrizzleDB,
          input.hackathonId,
          input.preferredTrack,
        );

        await tx.insert(judgeAssignments).values({
          judgeId: judge.id,
          hackathonId: input.hackathonId,
          track,
          status: "pending",
        });

        return { success: true };
      });
    }),

  // The judge's saved application for one edition, to prefill the edit form.
  myApplication: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const judge = await db.query.judges.findFirst({
        where: { userId: ctx.userId as string, hackathonId: input.hackathonId },
      });
      if (!judge) return null;
      const assignment = await db.query.judgeAssignments.findFirst({
        where: { judgeId: judge.id, hackathonId: input.hackathonId },
        columns: { track: true },
      });
      return {
        name: judge.name,
        email: judge.email,
        phone: judge.phone,
        company: judge.company,
        title: judge.title,
        specialty: judge.specialty,
        linkedinUrl: judge.linkedinUrl,
        githubUrl: judge.githubUrl,
        previousExperience: judge.previousExperience,
        dietaryRestrictions: judge.dietaryRestrictions ?? [],
        whyJudge: judge.whyJudge,
        canAttendInPerson: judge.canAttendInPerson,
        preferredTrack: assignment?.track ?? null,
      };
    }),

  // Edits the caller's own application. Approval (isActive and the
  // application's status) is deliberately not touched: only an organiser moves it.
  updateMyApplication: notHackathonBanned
    .input(applicationFields.extend({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        await assertEditionNotOver(tx as unknown as DrizzleDB, input.hackathonId);

        const judge = await tx.query.judges.findFirst({
          where: { userId: ctx.userId as string, hackathonId: input.hackathonId },
          columns: { id: true },
        });
        if (!judge) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "You have not applied to judge this hackathon.",
          });
        }

        const track = await assertTrackExists(
          tx as unknown as DrizzleDB,
          input.hackathonId,
          input.preferredTrack,
        );

        // The form resubmits every field, so a blank optional one clears it.
        await tx
          .update(judges)
          .set({
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            company: input.company || null,
            title: input.title || null,
            specialty: input.specialty || null,
            linkedinUrl: input.linkedinUrl || null,
            githubUrl: input.githubUrl || null,
            previousExperience: input.previousExperience,
            dietaryRestrictions: input.dietaryRestrictions || [],
            canAttendInPerson: input.canAttendInPerson,
            whyJudge: input.whyJudge,
          })
          .where(eq(judges.id, judge.id));

        await tx
          .update(judgeAssignments)
          .set({ track })
          .where(
            and(
              eq(judgeAssignments.judgeId, judge.id),
              eq(judgeAssignments.hackathonId, input.hackathonId),
            ),
          );

        return { success: true };
      });
    }),

  // Just the in-person answer, for the judge who applied before it was asked.
  setMyAttendance: notHackathonBanned
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        canAttendInPerson: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertEditionNotOver(db, input.hackathonId);

      const updated = await db
        .update(judges)
        .set({ canAttendInPerson: input.canAttendInPerson })
        .where(
          and(
            eq(judges.userId, ctx.userId as string),
            eq(judges.hackathonId, input.hackathonId),
          ),
        )
        .returning({ id: judges.id });
      if (updated.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You have not applied to judge this hackathon.",
        });
      }
      return { success: true };
    }),
});
