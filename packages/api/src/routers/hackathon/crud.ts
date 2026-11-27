import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../../trpc";
import { hackathons } from "@query/db";
import { eq, and, desc, gte, notInArray } from "drizzle-orm";
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
import { STAFF_ONLY_STATUSES } from "./visibility";
import type { DrizzleDB } from "@query/db";
import { seatedCounts, withSeatedCounts } from "../../services/derived-counts";
import {
  isOverEdition,
  markEditionRolesPending,
  syncDiscordRolesFor,
} from "../../services/discord";
import { notFound } from "../errors";

// Every hackathon read below returns currentParticipants counted from the
// participant rows (one grouped query per call). The stored column is retired:
// it drifted whenever a deleted user cascaded their registration away.

/** Must match `hackathonSlug` in sites/mainweb/lib/hackathon-slug.ts. */
export const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Must match `decodeHackathonParam` in sites/mainweb/lib/hackathon-slug.ts. */
function decodeHackathonParam(value: string) {
  let current = value;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

// Exact name first (including a percent-encoded name from old admin links),
// then the slug the portal links with.
//
// Two reads at worst, not three. The name is unique and indexed, so a link
// carrying it exactly still stops at one key lookup and never scans. Anything
// else is answered from the one read of every edition that the slug pass was
// always going to make anyway — the decoded name used to cost its own round
// trip in front of it, and the public hackathon page is reached by slug with
// this lookup deliberately uncached, so that trip landed on every load.
async function findByNameOrSlug(db: DrizzleDB, value: string) {
  const candidates = uniqueStrings([value, decodeHackathonParam(value)]);
  if (candidates.length === 0) return undefined;

  const exact = await db.query.hackathons.findFirst({
    where: { name: candidates[0]! },
  });
  if (exact) return exact;

  const slugs = uniqueStrings(candidates.map(toSlug));
  const all = await db.query.hackathons.findMany();

  return (
    all.find((row) => candidates.includes(row.name)) ??
    all.find((row) => slugs.includes(toSlug(row.name)))
  );
}

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
      type HackathonList = (Awaited<
        ReturnType<DB["query"]["hackathons"]["findMany"]>
      >[number] & { currentParticipants: number })[];

      // Staff-only statuses stay listable by admins (the setup and judging pages
      // pick a hackathon off this endpoint), so both the rows and the cache entry
      // depend on who is asking.
      // An explicit status filter is honoured, but for a non-admin a staff-only
      // status simply has no visible rows.
      const staffOnlyStatus =
        !!input.status && STAFF_ONLY_STATUSES.includes(input.status);

      // getOrSet: the entry lives VOLATILE_TTL seconds and is shared by every
      // caller asking the same question, so a plain miss let the whole
      // in-flight set run this query at once, five seconds apart, forever.
      const read = (adminViewer: boolean) =>
        ctx.cache.getOrSet<HackathonList>(
          `hackathons:list:${adminViewer ? "admin" : "public"}:${input.status || "all"}:${input.upcoming ? "upcoming" : "all"}:${input.limit}:${input.offset}`,
          async () => {
            const now = new Date();

            const db = ctx.db as DrizzleDB;
            const where = and(
              // Hidden means hidden from the public funnel, not from the people running the
              // event. Filtering it for staff too emptied the judging dashboard, which
              // picks an edition off here.
              adminViewer ? undefined : eq(hackathons.isPublic, true),
              input.status ? eq(hackathons.status, input.status) : undefined,
              adminViewer
                ? undefined
                : notInArray(hackathons.status, STAFF_ONLY_STATUSES),
              input.upcoming ? gte(hackathons.startDate, now) : undefined,
            );

            // The same filter as `where`, in the object form the relational query takes.
            const statusFilter = {
              ...(input.status ? { eq: input.status } : {}),
              ...(adminViewer ? {} : { notIn: STAFF_ONLY_STATUSES }),
            };
            const queryWhere = {
              ...(adminViewer ? {} : { isPublic: true }),
              ...(input.status || !adminViewer ? { status: statusFilter } : {}),
              ...(input.upcoming ? { startDate: { gte: now } } : {}),
            };

            // The seat counts select their editions with the same filter, order
            // and page, so they run beside the list, not after it.
            const [rows, seated] = await Promise.all([
              db.query.hackathons.findMany({
                where: queryWhere,
                limit: input.limit,
                offset: input.offset,
                // The id breaks ties, so the page and the seat-count
                // subquery below pick the same rows at a page boundary.
                orderBy: (hackathons, { desc }) => [
                  desc(hackathons.startDate),
                  desc(hackathons.id),
                ],
              }),
              seatedCounts(
                db,
                db
                  .select({ id: hackathons.id })
                  .from(hackathons)
                  .where(where)
                  .orderBy(desc(hackathons.startDate), desc(hackathons.id))
                  .limit(input.limit)
                  .offset(input.offset),
              ),
            ]);
            return rows.map((row) => ({
              ...row,
              currentParticipants: seated.get(row.id) ?? 0,
            }));
          },
          VOLATILE_TTL,
        );

      // Nearly every caller is not an admin, so the public listing starts
      // beside the admin check instead of after it: two reads in a row became
      // one round trip. An admin discards it and reads the admin listing.
      const publicRead = staffOnlyStatus ? null : read(false);
      publicRead?.catch(() => undefined);

      const adminViewer = await callerIsAdmin(ctx);
      if (adminViewer) return await read(true);
      return publicRead ? await publicRead : ([] as HackathonList);
    }),


  listAll: isAdmin.query(async ({ ctx }) => {
    const cacheKey = "hackathons:list:all";

    const fetchAll = async () => {
      const rows = await (ctx.db as DrizzleDB).query.hackathons.findMany({
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });
      return await withSeatedCounts(ctx.db as DrizzleDB, rows);
    };

    // Five-second TTL on a key the whole instance shares, so every expiry
    // used to put one unfiltered table read per in-flight request onto the
    // pool at the same moment. getOrSet lets the first one stand for all.
    return await ctx.cache.getOrSet<Awaited<ReturnType<typeof fetchAll>>>(
      cacheKey,
      fetchAll,
      VOLATILE_TTL,
    );
  }),


  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      type DB = DrizzleDB;
      type HackathonItem =
        | (NonNullable<
            Awaited<ReturnType<DB["query"]["hackathons"]["findFirst"]>>
          > & { currentParticipants: number })
        | undefined;
      // list() hides staff-only statuses, but this endpoint is reachable by id or
      // name, so a draft stays fetchable by anyone who guesses either. The cache
      // entry is shared, so visibility is enforced on the way out — otherwise one
      // admin lookup warms it and serves the unannounced hackathon to everybody.
      // Only draft gates here: isPublic=false marks invite-only events, whose
      // participants still need to open the link.
      const assertVisible = async (row: NonNullable<HackathonItem>) => {
        if (!STAFF_ONLY_STATUSES.includes(row.status)) return;
        if (await callerIsAdmin(ctx)) return;
        throw notFound("Hackathon not found");
      };

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.id,
        );

      // A hackathon is cached under its own id and nothing else. This endpoint also
      // accepts a name, but a second copy keyed by name gives the row two homes:
      // every writer evicts by id, so the name-keyed copy would outlive the
      // eviction and keep serving a stale seat count. A name lookup therefore
      // always hits the database and only refreshes the id-keyed entry.
      if (isUuid) {
        const cached = ctx.cache.get<HackathonItem>(
          CacheKeys.hackathon(input.id),
        );
        if (cached) {
          await assertVisible(cached);
          return cached;
        }
      }

      const found = isUuid
        ? await (ctx.db as DrizzleDB).query.hackathons.findFirst({
            where: { id: input.id },
          })
        : await findByNameOrSlug(ctx.db as DrizzleDB, input.id);

      if (!found) {
        throw notFound("Hackathon not found");
      }

      const [hackathon] = await withSeatedCounts(ctx.db as DrizzleDB, [found]);
      if (!hackathon) {
        throw notFound("Hackathon not found");
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
          // Draft keeps the hackathon invisible to participants; announced puts its
          // landing page and interest list live without opening registration; open lets
          // them register straight away without a second trip to the admin panel.
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
        // unique_hackathon_name. Admin URLs are built from the name, so a duplicate
        // makes one of the two unreachable — worth saying plainly rather than
        // surfacing a driver error.
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
        // Nullable as well as optional, like hackingStartTime: `null` clears the
        // deadline or the cap, so an organiser can go back to "no limit".
        registrationDeadline: z.date().nullable().optional(),
        hackingStartTime: z.date().nullable().optional(),
        maxParticipants: z
          .number()
          .int()
          .positive()
          .max(10000)
          .nullable()
          .optional(),
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
        // load-bearing: `undefined` means leave unchanged, `null` means clear it.
        // Optional alone gave the edit form no way to empty a field it had filled.
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
        // No empty-string escape hatch: "" would be stored and render as a link to
        // nowhere. Clearing the field sends null.
        websiteUrl: z.string().url().max(500).nullable().optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: { id },
      });

      if (!existing) {
        throw notFound("Hackathon not found");
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

      // An edition that ends takes its Discord roles with it, and one that is
      // reopened gives them back. Everyone linked who held one is marked pending
      // in the same transaction as the status.
      const flips =
        !!updateData.status &&
        isOverEdition(updateData.status) !== isOverEdition(existing.status);
      const write = (db: DrizzleDB) =>
        db
          .update(hackathons)
          .set({
            ...updateData,
            updatedAt: new Date(),
          })
          .where(eq(hackathons.id, id))
          .returning();
      let updatedHackathon;
      let owed: string[] = [];
      try {
        if (flips) {
          [updatedHackathon] = await (ctx.db as DrizzleDB).transaction(
            async (tx) => {
              const db = tx as unknown as DrizzleDB;
              const rows = await write(db);
              owed = await markEditionRolesPending(db, id);
              return rows;
            },
          );
        } else {
          [updatedHackathon] = await write(ctx.db as DrizzleDB);
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Another hackathon is already named "${updateData.name}". Names are used in admin links, so they have to be distinct.`,
          });
        }
        throw error;
      }

      // As many as one request has time for are cleared now; the daily job
      // takes the rest.
      await syncDiscordRolesFor(ctx.db as DrizzleDB, owed);

      ctx.cache.delete(CacheKeys.hackathon(id));
      ctx.cache.deletePattern("hackathons:*");

      return updatedHackathon;
    }),


  // Super-admin only. isAdmin never checks `role`, so "admin" and "moderator"
  // both passed and every staff account could destroy an edition. Three active
  // super_admin rows were verified first — a gate with nobody behind it is an
  // outage rather than a control.
  delete: isSuperAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        // The hackathon's own name, typed by the caller. Eleven tables cascade off
        // this row — every participant, team, project and judge vote. A browser
        // confirm() is one misplaced click; this is not.
        confirmName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { hackathonId, confirmName } = input;

      const existing = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: { id: hackathonId },
        columns: { id: true, name: true },
      });

      if (!existing) {
        throw notFound("Hackathon not found");
      }

      if (confirmName.trim() !== existing.name.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Type the hackathon's exact name to confirm. Expected "${existing.name}".`,
        });
      }

      // Every child table cascades off this row, so reporting success for an id
      // that matched nothing hides a delete that never happened. RETURNING names
      // the rows the statement removed, which a separate existence check cannot.
      let deleted;
      try {
        deleted = await (ctx.db as DrizzleDB)
          .delete(hackathons)
          .where(eq(hackathons.id, hackathonId))
          .returning({ id: hackathons.id });
      } catch (error) {
        // member.hackathon_id is ON DELETE RESTRICT, so this fires when paid club
        // memberships still hang off the edition. That is the guard working — those
        // rows are the only record of who paid and nothing re-creates them.
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
        throw notFound("Hackathon not found");
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
