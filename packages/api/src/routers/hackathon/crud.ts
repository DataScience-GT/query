import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../../trpc";
import { hackathons } from "@query/db";
import { eq, and, gte, notInArray } from "drizzle-orm";
import {
  callerIsAdmin,
  isAdmin,
  isSuperAdmin,
} from "../../middleware/procedures";
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from "../../middleware/db-errors";
import { recordAdminAction } from "../../middleware/audit";
import { CacheKeys, VOLATILE_TTL } from "../../middleware/cache";
import type { DrizzleDB } from "@query/db";

// A draft has not been announced yet, so it does not belong in a participant's
// browse list — create()'s own comment promises a draft stays invisible to
// participants. "cancelled" is deliberately NOT hidden: the hackathon detail
// and participants pages both ship a "Cancelled" status badge, and people who
// already registered need to be able to open the event and see that it is off.
const STAFF_ONLY_STATUSES: (typeof hackathons.$inferSelect)["status"][] = [
  "draft",
];

export const hackathonCrudRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        status: z
          .enum([
            "draft",
            "announced",
            "open",
            "closed",
            "in_progress",
            "completed",
            "cancelled",
          ])
          .optional(),
        upcoming: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      type DB = DrizzleDB;
      type HackathonList = Awaited<
        ReturnType<DB["query"]["hackathons"]["findMany"]>
      >;

      // Staff-only statuses are still listable by admins (the admin setup and
      // judging pages pick a hackathon off this endpoint), so both the rows and
      // the cache entry depend on who is asking.
      const adminViewer = await callerIsAdmin(ctx);

      // An explicit status filter is honoured, but for a non-admin a staff-only
      // status simply has no visible rows.
      if (
        !adminViewer &&
        input.status &&
        STAFF_ONLY_STATUSES.includes(input.status)
      ) {
        return [] as HackathonList;
      }

      const cacheKey = `hackathons:list:${adminViewer ? "admin" : "public"}:${input.status || "all"}:${input.upcoming ? "upcoming" : "all"}:${input.limit}:${input.offset}`;

      // Check cache first
      const cached = ctx.cache.get<HackathonList>(cacheKey);
      if (cached) return cached;

      const now = new Date();

      const allHackathons = await (
        ctx.db as DrizzleDB
      ).query.hackathons.findMany({
        where: and(
          // Hidden means hidden from the public funnel, not from the people
          // running the event. Filtering it for staff too emptied Judging Setup
          // and the Judging dashboard, which both pick an edition off here.
          adminViewer ? undefined : eq(hackathons.isPublic, true),
          input.status ? eq(hackathons.status, input.status) : undefined,
          adminViewer
            ? undefined
            : notInArray(hackathons.status, STAFF_ONLY_STATUSES),
          input.upcoming ? gte(hackathons.startDate, now) : undefined,
        ),
        limit: input.limit,
        offset: input.offset,
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });

      ctx.cache.set(cacheKey, allHackathons, VOLATILE_TTL);

      return allHackathons;
    }),


  listAll: isAdmin.query(async ({ ctx }) => {
    const cacheKey = "hackathons:list:all";

    const fetchAll = async () => {
      return await (ctx.db as DrizzleDB).query.hackathons.findMany({
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });
    };

    const cached =
      ctx.cache.get<Awaited<ReturnType<typeof fetchAll>>>(cacheKey);
    if (cached !== null) return cached;

    const allHackathons = await fetchAll();

    ctx.cache.set(cacheKey, allHackathons, VOLATILE_TTL);

    return allHackathons;
  }),


  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      type DB = DrizzleDB;
      type HackathonItem = Awaited<
        ReturnType<DB["query"]["hackathons"]["findFirst"]>
      >;
      /**
       * list() hides staff-only statuses, but this endpoint is reachable by id
       * or by name, so a draft stays fetchable by anyone who guesses either.
       * The cache entry is shared across callers, so visibility is enforced on
       * the way out — otherwise one admin lookup would warm the cache and then
       * serve the unannounced hackathon to everybody for VOLATILE_TTL.
       * Only the draft status gates here: isPublic=false is how invite-only
       * events are marked, and their participants still need to open the link.
       */
      const assertVisible = async (row: NonNullable<HackathonItem>) => {
        if (!STAFF_ONLY_STATUSES.includes(row.status)) return;
        if (await callerIsAdmin(ctx)) return;
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      };

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.id,
        );

      /**
       * A hackathon is cached under its own id and nothing else. This endpoint
       * also accepts a name, but keying a second copy under the name gives the
       * row two homes: every writer (register, update, delete) evicts by id, so
       * the name-keyed copy would outlive the eviction and keep serving a stale
       * seat count. A name lookup therefore always hits the database and only
       * refreshes the id-keyed entry.
       */
      if (isUuid) {
        const cached = ctx.cache.get<HackathonItem>(
          CacheKeys.hackathon(input.id),
        );
        if (cached) {
          await assertVisible(cached);
          return cached;
        }
      }

      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: isUuid
          ? eq(hackathons.id, input.id)
          : eq(hackathons.name, input.id),
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      ctx.cache.set(CacheKeys.hackathon(hackathon.id), hackathon, VOLATILE_TTL);

      await assertVisible(hackathon);

      return hackathon;
    }),


  create: isAdmin
    .input(
      z
        .object({
          name: z.string().min(1).max(200),
          description: z.string().max(5000).optional(),
          location: z.string().max(500).optional(),
          startDate: z.date(),
          endDate: z.date(),
          registrationDeadline: z.date().optional(),
          hackingStartTime: z.date().optional(),
          maxParticipants: z.number().int().positive().max(10000).optional(),
          prizes: z
            .array(
              z.object({
                place: z.string().max(50),
                amount: z.number().nonnegative(),
                description: z.string().max(500).optional(),
              }),
            )
            .max(20)
            .optional(),
          rules: z.string().max(10000).optional(),
          theme: z.string().max(200).optional(),
          tracks: z.array(z.string().max(100)).max(50).optional(),
          challenges: z.array(z.string().max(100)).max(50).optional(),
          websiteUrl: z.string().url().max(500).optional(),
          // Draft keeps the hackathon invisible to participants; announced puts
          // its landing page and interest list live without opening
          // registration; open lets them register straight away without a
          // second trip to the admin panel.
          status: z.enum(["draft", "announced", "open"]).default("draft"),
        })
        .refine((data) => data.endDate > data.startDate, {
          message: "End date must be after start date",
        })
        .refine(
          (data) =>
            !data.registrationDeadline ||
            data.registrationDeadline <= data.startDate,
          {
            message: "Registration deadline must be before or equal to the event start date",
          },
        )
        .refine(
          (data) =>
            !data.hackingStartTime ||
            (data.hackingStartTime >= data.startDate &&
              data.hackingStartTime <= data.endDate),
          {
            message:
              "Hacking start time must be within the event window (between start date and end date)",
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      let newHackathon;
      try {
        [newHackathon] = await (ctx.db as DrizzleDB)
          .insert(hackathons)
          .values({
            ...input,
          })
          .returning();
      } catch (error) {
        // unique_hackathon_name. Admin URLs are built from the name, so a
        // duplicate would make one of the two unreachable — worth saying
        // plainly rather than surfacing a driver error.
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A hackathon named "${input.name}" already exists. Names are used in admin links, so they have to be distinct.`,
          });
        }
        throw error;
      }

      ctx.cache.deletePattern("hackathons:*");

      return newHackathon;
    }),


  update: isAdmin
    .input(
      z.object({
        id: z.string().uuid("Invalid hackathon ID"),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        location: z.string().max(500).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        registrationDeadline: z.date().optional(),
        hackingStartTime: z.date().nullable().optional(),
        maxParticipants: z.number().int().positive().max(10000).optional(),
        status: z
          .enum([
            "draft",
            "announced",
            "open",
            "closed",
            "in_progress",
            "completed",
            "cancelled",
          ])
          .optional(),
        // These five are nullable as well as optional, and the distinction is
        // load-bearing: `undefined` means "leave unchanged", `null` means
        // "clear it". Optional alone gave the edit form no way to empty a
        // field it had already filled — sending `[]` reads as unchanged.
        prizes: z
          .array(
            z.object({
              place: z.string().max(50),
              amount: z.number().nonnegative(),
              description: z.string().max(500).optional(),
            }),
          )
          .max(20)
          .nullable()
          .optional(),
        rules: z.string().max(10000).nullable().optional(),
        theme: z.string().max(200).optional(),
        tracks: z.array(z.string().max(100)).max(50).nullable().optional(),
        challenges: z.array(z.string().max(100)).max(50).nullable().optional(),
        // No empty-string escape hatch: "" would be stored and render as a
        // link to nowhere. Clearing the field sends null.
        websiteUrl: z.string().url().max(500).nullable().optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      // Merge with existing dates for partial-update validation
      const resolvedStart = updateData.startDate ?? existing.startDate;
      const resolvedEnd = updateData.endDate ?? existing.endDate;

      if (resolvedEnd <= resolvedStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End date must be after start date",
        });
      }

      // hackingStartTime: null clears it; undefined leaves it unchanged
      const resolvedHackingStart =
        updateData.hackingStartTime === null
          ? null
          : (updateData.hackingStartTime ?? existing.hackingStartTime);

      if (
        resolvedHackingStart !== null &&
        resolvedHackingStart !== undefined &&
        (resolvedHackingStart < resolvedStart ||
          resolvedHackingStart > resolvedEnd)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Hacking start time must be within the event window (between start date and end date)",
        });
      }

      let updatedHackathon;
      try {
        [updatedHackathon] = await (ctx.db as DrizzleDB)
          .update(hackathons)
          .set({
            ...updateData,
            updatedAt: new Date(),
          })
          .where(eq(hackathons.id, id))
          .returning();
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Another hackathon is already named "${updateData.name}". Names are used in admin links, so they have to be distinct.`,
          });
        }
        throw error;
      }

      ctx.cache.delete(CacheKeys.hackathon(id));
      ctx.cache.deletePattern("hackathons:*");

      return updatedHackathon;
    }),


  /**
   * Super-admin only.
   *
   * isAdmin never checks `role`, so the default "admin" and "moderator" both
   * passed — every staff account could destroy an edition. Verified three
   * active super_admin rows exist before narrowing this, because a gate with
   * nobody behind it is an outage rather than a control.
   */
  delete: isSuperAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        // The hackathon's own name, typed by the caller. Eleven tables cascade
        // off this row — every participant, team, project and judge vote for
        // the event. A browser confirm() is one misplaced click; this is not.
        confirmName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { hackathonId, confirmName } = input;

      const existing = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, hackathonId),
        columns: { id: true, name: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      if (confirmName.trim() !== existing.name.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Type the hackathon's exact name to confirm. Expected "${existing.name}".`,
        });
      }

      // Every child table cascades off this row, so reporting success for an id
      // that matched nothing hides a delete that never happened. RETURNING names
      // the rows the statement itself removed, which a separate existence check
      // cannot: that only describes the row as it was before the DELETE, and a
      // concurrent delete landing in between would still be called a success.
      let deleted;
      try {
        deleted = await (ctx.db as DrizzleDB)
          .delete(hackathons)
          .where(eq(hackathons.id, hackathonId))
          .returning({ id: hackathons.id });
      } catch (error) {
        // member.hackathon_id is ON DELETE RESTRICT, so this fires when paid
        // club memberships still hang off the edition. That is the guard
        // working, not a bug — those rows are the only record of who paid and
        // nothing re-creates them.
        if (isForeignKeyViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This hackathon still has club memberships attached. Those are paid records and cannot be cascaded away — move or remove them deliberately first.",
          });
        }
        throw error;
      }

      if (deleted?.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      await recordAdminAction(ctx.db as DrizzleDB, {
        userId: ctx.userId,
        action: "hackathon.delete",
        resourceId: hackathonId,
        severity: "critical",
        // The name is recorded because the row it came from no longer exists.
        metadata: { name: existing.name },
      });

      ctx.cache.delete(CacheKeys.hackathon(hackathonId));
      ctx.cache.deletePattern("hackathons:*");
      return { success: true };
    }),

});
