import { admins, members, judges, projectLeaders } from "@query/db";
// Deep import: the one rule for "which hackathon is current", shared
// with the sign-in hook in @query/auth.
import {
  resolveCurrentHackathonId,
  setMembershipChangeHandler,
} from "@query/db/services/membership";
import { eq, and } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { cache, clearMembershipCaches } from "../middleware/cache";
import {
  EMPTY_MEMBER_CONTEXT,
  isStaffRole,
  isExpiredAdmin,
} from "../types/portal-context";
import type { MemberContext, PortalContext } from "../types/portal-context";

const CURRENT_HACKATHON_KEY = "hackathon:current-id";

// The sign-in hook grants memberships and cannot reach this cache, so the
// evictor is registered here.
setMembershipChangeHandler(clearMembershipCaches);

function buildMemberContext(
  memberRecord: {
    isActive: boolean;
    membershipEndDate: Date | null;
    memberType: string | null;
    renewalCount: number;
  } | null | undefined,
): MemberContext {
  if (!memberRecord) return EMPTY_MEMBER_CONTEXT;

  const now = new Date();
  const expiresAt = memberRecord.membershipEndDate;
  const isActive = !!(
    memberRecord.isActive &&
    expiresAt &&
    expiresAt > now
  );

  let daysRemaining: number | null = null;
  if (expiresAt) {
    daysRemaining = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return {
    // Paid and unexpired, not merely "a row exists". Club benefits gate on this;
    // hackathon participation deliberately does not.
    isMember: isActive,
    isActive,
    // Paid once, ran out. A row switched off while its date is still future is a
    // staff action, not a lapse.
    hasLapsed: !isActive && !!expiresAt && expiresAt <= now,
    expiresAt,
    daysRemaining,
    memberType: memberRecord.memberType,
    renewalCount: memberRecord.renewalCount,
  };
}

// Default edition: the one running, else the newest by start date. Every
// membership read and write must agree, or a payment lands under one edition
// while the status lookup asks about another.
export async function resolveHackathonId(
  db: DrizzleDB,
  inputId?: string,
): Promise<string | undefined> {
  if (inputId) return inputId;

  // Cached: two queries on hot paths, and the current edition changes about
  // twice a year. "" means none, since a miss also reads as null.
  const cached = cache.get<string>(CURRENT_HACKATHON_KEY);
  if (cached !== null) return cached || undefined;

  // The rule lives in @query/db so sign-in and the webhook share it; this
  // wrapper only adds the cache.
  const resolved = await resolveCurrentHackathonId(db);

  cache.set(CURRENT_HACKATHON_KEY, resolved ?? "", 60);

  return resolved;
}

/** Loads admin, judge, and member flags for the current user in one round-trip batch. */
export async function fetchPortalContext(
  db: DrizzleDB,
  userId: string,
): Promise<PortalContext> {
  // All four in one round trip — the member read depends on nothing in the
  // batch and used to cost a second one.
  const [admin, judgeRecord, leaderRecord, memberRecord] = await Promise.all([
    db.query.admins.findFirst({
      where: and(eq(admins.userId, userId), eq(admins.isActive, true)),
    }),
    db.query.judges.findFirst({
      where: and(eq(judges.userId, userId), eq(judges.isActive, true)),
      columns: { id: true, name: true },
    }),
    // Club side, so it neither waits on the edition nor vanishes between them.
    db.query.projectLeaders.findFirst({
      where: and(
        eq(projectLeaders.userId, userId),
        eq(projectLeaders.isActive, true),
      ),
      columns: { id: true },
    }),
    // Membership does not depend on an edition resolving.
    db.query.members.findFirst({
      where: eq(members.userId, userId),
      // Four fields only; the row carries the whole profile, bio and skills
      // arrays included.
      columns: {
        isActive: true,
        membershipEndDate: true,
        memberType: true,
        renewalCount: true,
      },
    }),
  ]);

  // A lapsed fixed-term appointment counts as no admin row, so nav and the
  // API gates agree on who is staff today.
  const staff = isExpiredAdmin(admin) ? null : admin;

  const member = buildMemberContext(memberRecord ?? null);

  const isProjectLeader = !!leaderRecord;

  return {
    // A volunteer holds an admins row but is not staff — reporting them as admin
    // renders nav that every one of those pages rejects.
    isAdmin: isStaffRole(staff?.role),
    isScanner: !!staff,
    role: staff?.role ?? null,
    permissions: staff?.permissions ?? [],
    isJudge: !!judgeRecord,
    judgeId: judgeRecord?.id ?? null,
    judgeName: judgeRecord?.name ?? null,
    // Admins cover for leaders and the middleware agrees. isStaffRole, not
    // !!admin: isProjectLeader rejects volunteers.
    isProjectLeader: isProjectLeader || isStaffRole(staff?.role),
    member,
  };
}

export { buildMemberContext };
