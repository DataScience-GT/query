import { TRPCError } from "@trpc/server";
import { protectedProcedure, textUploadProcedure } from "../trpc";
import { admins, hackathonBans, users, projectLeaders } from "@query/db";
import { eq, and } from "drizzle-orm";
import { CacheKeys } from "./cache";
import {
  isStaffRole,
  isBugTesterRole,
  isExpiredAdmin,
} from "../types/portal-context";
import type { Context } from "../context";

// Admin check for a publicProcedure that widens its response for staff.
// Unlike the isAdmin middleware, this caches the NEGATIVE answer too:
// ordinary participants are the overwhelming majority of signed-in callers on
// hackathon.list and hackathon.projects, and caching only the positive turned
// every one of their requests into an `admins` round trip.
export const callerIsAdmin = async (ctx: Context) => {
  if (!ctx.userId || !ctx.db) return false;

  const cacheKey = `${CacheKeys.admin(ctx.userId)}:is-admin`;
  const cached = ctx.cache.get<boolean>(cacheKey);
  if (cached !== null) return cached;

  const admin = await ctx.db.query.admins.findFirst({
    where: and(eq(admins.userId, ctx.userId), eq(admins.isActive, true)),
  });

  // Staff only: this widens public responses and, through isProjectLeader,
  // lets the caller act on other leaders' initiatives. A bug tester gets
  // neither.
  const isStaff = !!admin && isStaffRole(admin.role) && !isExpiredAdmin(admin);

  ctx.cache.set(cacheKey, isStaff, 60);

  return isStaff;
};


// Loads the caller's active admin row, cached 60s per user. Shared by
// isScanner and isAdmin so a check-in station and a staff action cost the
// same single lookup.
const loadAdminRow = async (ctx: Context) => {
  const cacheKey = `${CacheKeys.admin(ctx.userId as string)}:role`;
  let admin = ctx.cache.get<typeof admins.$inferSelect>(cacheKey);

  if (!admin) {
    admin =
      (await (ctx.db as NonNullable<typeof ctx.db>).query.admins.findFirst({
        where: and(
          eq(admins.userId, ctx.userId as string),
          eq(admins.isActive, true),
        ),
      })) ?? null;

    if (admin) ctx.cache.set(cacheKey, admin, 60);
  }

  // Applied after the cache read too: a fixed term can lapse inside the 60s
  // window the row is held for.
  if (isExpiredAdmin(admin)) return null;

  return admin;
};

// Anyone staffing the event, volunteers included. Scoped to badge scanning
// and its undo: a 2000-person event runs several check-in stations, and those
// people should not hold the role that can delete the hackathon.
export const isScanner = protectedProcedure.use(async ({ ctx, next, type }) => {
  const admin = await loadAdminRow(ctx);

  if (!admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Event staff access required",
    });
  }

  if (isBugTesterRole(admin.role) && type !== "query") {
    throw new TRPCError({ code: "FORBIDDEN", message: READ_ONLY_MESSAGE });
  }

  return next({ ctx: { ...ctx, admin } });
});

const READ_ONLY_MESSAGE =
  "Bug testers have read-only access. Ask an admin to make this change.";

// Full staff. Volunteers are rejected here — they hold an admins row, so
// without the role check they would pass every admin gate in the API. Bug
// testers pass for queries only: the check is on the procedure type, so every
// mutation behind this gate (and isSuperAdmin, built on it) refuses them
// without each procedure having to remember to. Cached 60s per user to avoid
// a round trip on every request.
const requireAdmin = async (ctx: Context, type: string) => {
  const admin = await loadAdminRow(ctx);

  const readOnly = !!admin && isBugTesterRole(admin.role);

  if (!admin || (!isStaffRole(admin.role) && !readOnly)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  if (readOnly && type !== "query") {
    throw new TRPCError({ code: "FORBIDDEN", message: READ_ONLY_MESSAGE });
  }

  return admin;
};

export const isAdmin = protectedProcedure.use(async ({ ctx, next, type }) => {
  const admin = await requireAdmin(ctx, type);
  return next({ ctx: { ...ctx, admin } });
});

// isAdmin for a file uploaded as text (a Devpost export): the same check, on
// a procedure that takes up to 12 MB and does not refuse markup in prose.
export const isAdminUpload = textUploadProcedure.use(
  async ({ ctx, next, type }) => {
    const admin = await requireAdmin(ctx, type);
    return next({ ctx: { ...ctx, admin } });
  },
);

// Super admin. Must be used after isAdmin.
export const isSuperAdmin = isAdmin.use(async ({ ctx, next }) => {
  if (ctx.admin.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super admin access required",
    });
  }
  return next({ ctx });
});

// Verifies the caller runs club initiatives. Not scoped to a hackathon:
// leading is a standing appointment, and resolving the current edition first
// meant the gate refused every leader whenever no hackathon row existed.
// Admins pass without a project_leader row, since staff cover for a leader
// who has gone quiet; the reverse is not true. Holding the role is half the
// gate — every procedure also checks who leads that initiative, and an admin
// is the only caller allowed to skip it.
export const isProjectLeader = protectedProcedure.use(async ({ ctx, next }) => {
  const db = ctx.db as NonNullable<typeof ctx.db>;
  const userId = ctx.userId as string;

  const cacheKey = `${CacheKeys.projectLeader(userId)}:role`;
  // The absent row is cached too, as `false`. An admin passes this gate
  // without a project_leader row, so every initiative call staff make used to
  // pay a lookup that was never going to return anything. Grants clear
  // `project-leader:<id>*`, which covers the negative as well.
  let leader = ctx.cache.get<typeof projectLeaders.$inferSelect | false>(
    cacheKey,
  );

  if (leader === null) {
    leader =
      (await db.query.projectLeaders.findFirst({
        where: and(
          eq(projectLeaders.userId, userId),
          eq(projectLeaders.isActive, true),
        ),
      })) ?? false;

    ctx.cache.set(cacheKey, leader, 60);
  }

  // Resolved even when a leader row exists: somebody can be both, and the
  // ownership checks downstream need to know whether to let them past another
  // leader's initiative. callerIsAdmin caches both answers.
  const isPlatformAdmin = await callerIsAdmin(ctx);

  if (!leader && !isPlatformAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Project leader access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      projectLeader: leader || null,
      isPlatformAdmin,
    },
  });
});

/** Cache key for a hackathon-ban lookup. Shared with the ban/unban mutations. */
export const hackathonBanCacheKey = (email: string) =>
  `hackathon-ban:${email.trim().toLowerCase()}`;

// Refuses people banned from hackathons. Goes on the procedures where someone
// takes part — registering, the interest list, teams, submitting, applying to
// judge — and not on reads or on the ways out (withdraw, leave), so a banned
// person can still see and undo what they already did. The ban is by email,
// so it holds across providers and new accounts on the same address. Cached
// 60s, the negative answer too; ban and unban clear the key.
export const notHackathonBanned = protectedProcedure.use(
  async ({ ctx, next }) => {
    const db = ctx.db as NonNullable<typeof ctx.db>;

    let email = ctx.session?.user?.email ?? null;
    if (!email) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId as string),
        columns: { email: true },
      });
      email = user?.email ?? null;
    }

    if (email) {
      const key = hackathonBanCacheKey(email);
      let banned = ctx.cache.get<boolean>(key);
      if (banned === null) {
        const ban = await db.query.hackathonBans.findFirst({
          where: eq(hackathonBans.email, email.trim().toLowerCase()),
          columns: { id: true },
        });
        banned = !!ban;
        ctx.cache.set(key, banned, 60);
      }

      if (banned) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You can't take part in Hacklytics events. If you think this is a mistake, email hello@hacklytics.io.",
        });
      }
    }

    return next({ ctx });
  },
);
