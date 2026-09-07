import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
// membershipHistory is written by createOrUpdateMembership on a real payment,
// and by the admin operations below when somebody pays another way.
import { members, membershipHistory, users } from "@query/db";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import {
  clearMembershipCaches,
  invalidatePortalContext,
} from "../middleware/cache";
import { isAdmin } from "../middleware/procedures";
import { recordAdminAction } from "../middleware/audit";
import { splitName } from "@query/db/services/membership";

// Letters from every script, plus the combining marks, spaces, hyphens and
// apostrophes (straight and typographic) that real names are written with.
const nameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{M}\s'’-]+$/u, "Invalid name format");
const urlSchema = z.string().url().max(500).optional();
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number")
  .optional();

export const memberRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    // getOrSet, so "this user has no member row" caches like any other
    // answer. Read through get() a null result was indistinguishable from a
    // miss, and everyone who has signed in without registering — most signed
    // in users — re-queried on every portal page.
    return ctx.cache.getOrSet(
      `member:me:${ctx.userId}`,
      async () =>
        (await (ctx.db as DrizzleDB).query.members.findFirst({
          where: eq(members.userId, ctx.userId!),
        })) ?? null,
      60,
    );
  }),

  register: protectedProcedure
    .input(
      // Nullable for the same reason `update` is: the form sends null for a field
      // left blank, and creating with null is creating without it.
      z.object({
        firstName: nameSchema,
        lastName: nameSchema,
        phoneNumber: phoneSchema.nullable().optional(),
        school: z.string().min(1).max(200).nullable().optional(),
        major: z.string().min(1).max(200).nullable().optional(),
        graduationYear: z
          .number()
          .int()
          .min(2024)
          .max(2035)
          .nullable()
          .optional(),
        skills: z.array(z.string().max(50)).max(20).optional(),
        interests: z.array(z.string().max(50)).max(20).optional(),
        linkedinUrl: urlSchema.nullable(),
        githubUrl: urlSchema.nullable(),
        portfolioUrl: urlSchema.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingMember = await (
        ctx.db as DrizzleDB
      ).query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      if (existingMember) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have a member profile",
        });
      }

      // This writes a PROFILE, not a membership. It used to stamp
      // `membershipEndDate = now + 1 year` and let isActive default true, handing
      // any signed-in caller a paid-tier membership for nothing — the same hole the
      // note below records for the deleted `renew`. Only createOrUpdateMembership,
      // driven by a completed payment, may set a term. membershipStartDate is not
      // null in the schema so it carries creation time; it grants nothing, since
      // both checkStatus and buildMemberContext require an unexpired end date.
      const result = await (ctx.db as DrizzleDB)
        .insert(members)
        .values({
          userId: ctx.userId!,
          memberType: "new",
          firstName: input.firstName,
          lastName: input.lastName,
          phoneNumber: input.phoneNumber,
          school: input.school,
          major: input.major,
          graduationYear: input.graduationYear,
          skills: input.skills || [],
          interests: input.interests || [],
          linkedinUrl: input.linkedinUrl,
          githubUrl: input.githubUrl,
          portfolioUrl: input.portfolioUrl,
          membershipStartDate: new Date(),
          membershipEndDate: null,
          isActive: false,
        })
        .returning();

      const newMember = result[0];

      if (!newMember) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create member",
        });
      }

      // No membershipHistory "joined" row either: nothing was joined until a
      // payment lands, and createOrUpdateMembership records that.

      invalidatePortalContext(ctx.userId!);

      return newMember;
    }),

  // Renewal is not an endpoint. A membership is one paid year and only a
  // completed payment extends it, through createOrUpdateMembership. A free
  // renew procedure lived here as a plain protectedProcedure and let any
  // signed-in user grant themselves another year over tRPC.

  // Every optional field is nullable, and null means CLEAR IT. With `undefined`
  // as the only "not set" value, a member who emptied their LinkedIn sent
  // nothing, the column was skipped, and the old value came back — a save that
  // reported success and changed nothing.
  update: protectedProcedure
    .input(
      z.object({
        firstName: nameSchema.optional(),
        lastName: nameSchema.optional(),
        phoneNumber: phoneSchema.nullable().optional(),
        school: z.string().min(1).max(200).nullable().optional(),
        major: z.string().min(1).max(200).nullable().optional(),
        graduationYear: z
          .number()
          .int()
          .min(2024)
          .max(2035)
          .nullable()
          .optional(),
        skills: z.array(z.string().max(50)).max(20).optional(),
        interests: z.array(z.string().max(50)).max(20).optional(),
        linkedinUrl: urlSchema.nullable(),
        githubUrl: urlSchema.nullable(),
        portfolioUrl: urlSchema.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      const result = await (ctx.db as DrizzleDB)
        .update(members)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(members.id, member.id))
        .returning();

      const updatedMember = result[0];

      if (!updatedMember) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update member",
        });
      }

      // `me` caches for 60s; without this the form saves and re-reads the old
      // values, which is indistinguishable from the save having failed.
      clearMembershipCaches(ctx.userId!);

      return updatedMember;
    }),

  // The member directory, for staff. Was a publicProcedure, so anyone could
  // page through every member's name, school and major for a directory no page
  // renders. Staff-only until whether the club wants a public one is answered.
  list: isAdmin
    .input(
      z.object({
        memberType: z.enum(["new", "continuous"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cacheKey = `members:list:${input.memberType || "all"}:${input.limit}:${input.offset}`;
      const cached = ctx.cache.get<typeof allMembers>(cacheKey);
      if (cached) return cached;

      const allMembers = await (ctx.db as DrizzleDB).query.members.findMany({
        where: and(
          eq(members.isActive, true),
          input.memberType
            ? eq(members.memberType, input.memberType)
            : undefined,
        ),
        limit: input.limit,
        offset: input.offset,
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          school: true,
          major: true,
          skills: true,
          interests: true,
          joinedAt: true,
          memberType: true,
          phoneNumber: false,
        },
      });

      ctx.cache.set(cacheKey, allMembers, 60);

      return allMembers;
    }),

  /** One member's directory entry. Staff-only for the same reason as `list`. */
  getById: isAdmin
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.id, input.id),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          school: true,
          major: true,
          skills: true,
          interests: true,
          joinedAt: true,
          memberType: true,
          phoneNumber: false,
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      return member;
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    // Rendered on the settings page, so it runs on a page load rather than on
    // an action, and the rows only move when a membership does — which every
    // path that writes one already evicts through `member:*`.
    const history = await ctx.cache.getOrSet(
      `member:history:${ctx.userId}`,
      async () => {
        const member = await (ctx.db as DrizzleDB).query.members.findFirst({
          where: eq(members.userId, ctx.userId!),
          columns: { id: true },
          with: {
            membershipHistory: {
              orderBy: (h, { desc }) => [desc(h.createdAt)],
              limit: 50,
            },
          },
        });

        return member?.membershipHistory ?? null;
      },
      60,
    );

    if (!history) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    }

    return history;
  }),

  /** The caller's own pass, for the QR an officer scans at the door. */
  myPass: protectedProcedure.query(async ({ ctx }) => {
    const member = await (ctx.db as DrizzleDB).query.members.findFirst({
      where: eq(members.userId, ctx.userId as string),
      columns: { passCode: true, firstName: true, lastName: true },
    });

    return member ?? null;
  }),

  /** Kills a pass that has been photographed or shared. */
  rotatePass: protectedProcedure.mutation(async ({ ctx }) => {
    const [updated] = await (ctx.db as DrizzleDB)
      .update(members)
      .set({ passCode: sql`gen_random_uuid()`, updatedAt: new Date() })
      .where(eq(members.userId, ctx.userId as string))
      .returning({ passCode: members.passCode });

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "You do not have a member profile yet.",
      });
    }

    return updated;
  }),

  checkStatus: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = `member:status:${ctx.userId}`;
    const cached = ctx.cache.get<{
      isMember: boolean;
      isActive: boolean;
      hasLapsed: boolean;
      expiresAt: Date | null;
      daysRemaining: number | null;
      memberType: string | null;
      renewalCount: number;
    }>(cacheKey);
    if (cached) return cached;

    const member = await (ctx.db as DrizzleDB).query.members.findFirst({
      where: eq(members.userId, ctx.userId!),
    });

    if (!member) {
      const result = {
        isMember: false,
        isActive: false,
        hasLapsed: false,
        expiresAt: null,
        daysRemaining: null,
        memberType: null,
        renewalCount: 0,
      };
      ctx.cache.set(cacheKey, result, 30);
      return result;
    }

    const now = new Date();
    const expiresAt = member.membershipEndDate;
    const isActive = Boolean(member.isActive && expiresAt && expiresAt > now);

    let daysRemaining: number | null = null;
    if (expiresAt) {
      daysRemaining = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    const result = {
      // Paid and unexpired. A profile with no payment and a row whose year ran out
      // both answer false — the same rule the portal context uses.
      isMember: isActive,
      isActive,
      // Same rule as buildMemberContext: ran out, not revoked.
      hasLapsed: !isActive && Boolean(expiresAt) && expiresAt! <= now,
      memberType: member.memberType,
      expiresAt,
      daysRemaining,
      renewalCount: member.renewalCount,
    };

    ctx.cache.set(cacheKey, result, 30);

    return result;
  }),

  // Staff-facing membership operations: cash at a table, a comped officer, a
  // refund. None come through Stripe, and none had any path but direct SQL.
  // All audit-logged — granting a paid membership for free is exactly the
  // action a record needs to exist for.
  adminSearch: isAdmin
    .input(
      z.object({
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;

      const rows = await (ctx.db as DrizzleDB)
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          memberId: members.id,
          firstName: members.firstName,
          lastName: members.lastName,
          isActive: members.isActive,
          membershipEndDate: members.membershipEndDate,
          memberType: members.memberType,
          renewalCount: members.renewalCount,
          bootcampMember: members.bootcampMember,
        })
        .from(users)
        .leftJoin(members, eq(members.userId, users.id))
        .where(or(ilike(users.email, pattern), ilike(users.name, pattern)))
        .limit(input.limit);

      const now = new Date();
      return rows.map((row) => ({
        ...row,
        // Same rule as checkStatus and the portal context: paid and unexpired.
        isCurrentMember: Boolean(
          row.isActive && row.membershipEndDate && row.membershipEndDate > now,
        ),
      }));
    }),

  /** One person's membership history, for staff resolving a dispute. */
  adminHistory: isAdmin
    .input(z.object({ userId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.userId, input.userId),
        columns: { id: true },
      });

      if (!member) return [];

      return await (ctx.db as DrizzleDB).query.membershipHistory.findMany({
        where: eq(membershipHistory.memberId, member.id),
        orderBy: [desc(membershipHistory.createdAt)],
        limit: 100,
      });
    }),

  // Grants or extends a membership without a payment, or shortens one. `months`
  // is added to whatever term is left, so comping mid-term does not shorten
  // anyone; a negative value walks back a refund or a mistake.
  adminGrant: isAdmin
    .input(
      z.object({
        userId: z.string().min(1).max(255),
        months: z
          .number()
          .int()
          .min(-24)
          .max(24)
          .refine((n) => n !== 0, {
            message: "Choose a number of months to add or remove.",
          }),
        /** Recorded on the history row, so the reason survives the person. */
        note: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const user = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: { id: true, name: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // One transaction, behind a lock on the member row. The update and its
      // history row were separate writes, so a failure between them left a changed
      // term with no record of why; and the new term was computed from a row read
      // outside any lock, so two staff extending the same person both measured from
      // the same end date and one grant vanished.
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({
            id: members.id,
            membershipEndDate: members.membershipEndDate,
            membershipStartDate: members.membershipStartDate,
          })
          .from(members)
          .where(eq(members.userId, input.userId))
          .for("update");

        const now = new Date();
        // Extending measures from the end of the current term, so a comp added
        // mid-year is a year on top rather than a year from today.
        const base =
          locked?.membershipEndDate && locked.membershipEndDate > now
            ? locked.membershipEndDate
            : now;
        const termEnd = new Date(base);
        termEnd.setMonth(termEnd.getMonth() + input.months);

        if (locked) {
          await tx
            .update(members)
            .set({
              // Removing months can leave the term in the past; the row then reads as
              // lapsed rather than pretending to be active.
              isActive: termEnd > now,
              membershipEndDate: termEnd,
              memberType: "continuous",
              updatedAt: now,
            })
            .where(eq(members.id, locked.id));

          await tx.insert(membershipHistory).values({
            memberId: locked.id,
            action: input.months > 0 ? "renewed" : "cancelled",
            startDate: base,
            endDate: termEnd,
            notes: `Admin: ${input.note}`,
          });

          return { termEnd, isActive: termEnd > now };
        }

        if (input.months < 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That person has no membership to shorten.",
          });
        }

        const { firstName, lastName } = splitName(user.name);

        const [created] = await tx
          .insert(members)
          .values({
            userId: input.userId,
            firstName,
            lastName,
            memberType: "new",
            isActive: true,
            membershipStartDate: now,
            membershipEndDate: termEnd,
            renewalCount: 0,
          })
          .returning({ id: members.id });

        if (created) {
          await tx.insert(membershipHistory).values({
            memberId: created.id,
            action: "joined",
            startDate: now,
            endDate: termEnd,
            notes: `Admin: ${input.note}`,
          });
        }

        return { termEnd, isActive: true };
      });

      clearMembershipCaches(input.userId);

      // After the writes, never inside a transaction with them: a failed audit
      // insert aborts the session and turns COMMIT into a silent ROLLBACK.
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "member.adminGrant",
        resourceId: input.userId,
        // Handing out a paid membership for nothing is precisely the action somebody
        // may later need to account for.
        severity: "critical",
        metadata: { months: input.months, note: input.note },
      });

      return {
        membershipEndDate: outcome.termEnd,
        isActive: outcome.isActive,
      };
    }),

  // Ends a membership now. The row and its history stay: deleting the member
  // would take the record of every year they were one, and this is usually a
  // correction rather than a denial that the person existed.
  adminRevoke: isAdmin
    .input(
      z.object({
        userId: z.string().min(1).max(255),
        note: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      // Same reasoning as adminGrant: the end and its history row are one
      // transaction, so a membership cannot be ended with no record of why.
      await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({
            id: members.id,
            membershipStartDate: members.membershipStartDate,
          })
          .from(members)
          .where(eq(members.userId, input.userId))
          .for("update");

        if (!locked) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That person has no membership.",
          });
        }

        const now = new Date();

        await tx
          .update(members)
          .set({ isActive: false, membershipEndDate: now, updatedAt: now })
          .where(eq(members.id, locked.id));

        await tx.insert(membershipHistory).values({
          memberId: locked.id,
          action: "cancelled",
          startDate: locked.membershipStartDate,
          endDate: now,
          notes: `Admin: ${input.note}`,
        });
      });

      clearMembershipCaches(input.userId);

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "member.adminRevoke",
        resourceId: input.userId,
        severity: "critical",
        metadata: { note: input.note },
      });

      return { success: true };
    }),
});
