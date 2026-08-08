import { admins, members, judges, projectLeaders } from "@query/db";
// Deep import on purpose: this is the one rule for "which hackathon is
// current", shared with the sign-in hook in @query/auth.
import {
  resolveCurrentHackathonId,
  setMembershipChangeHandler,
} from "@query/db/services/membership";
import { eq, and } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { cache, clearMembershipCaches } from "../middleware/cache";
import { EMPTY_MEMBER_CONTEXT, isStaffRole } from "../types/portal-context";
import type { MemberContext, PortalContext } from "../types/portal-context";

const CURRENT_HACKATHON_KEY = "hackathon:current-id";

// The sign-in hook in @query/auth grants memberships and cannot reach this
// cache; registering here is how those grants get their entries evicted.
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
    /**
     * Paid and unexpired, not merely "a row exists". A `member` row is also
     * written for a profile with no payment behind it, and the row outlives the
     * year it paid for — reporting either as a member is what let a lapsed
     * member be greeted as active while the pay button stayed hidden.
     *
     * Club benefits gate on this. Hackathon participation deliberately does
     * NOT: the hackathon is open to everyone, member or not.
     */
    isMember: isActive,
    isActive,
    /**
     * Paid once, ran out — what turns the club view into a renew prompt.
     *
     * Ran out, rather than revoked: a row switched off while its date is still
     * in the future is a staff action, and prompting that person to renew a
     * membership they still hold would be wrong.
     */
    hasLapsed: !isActive && !!expiresAt && expiresAt <= now,
    expiresAt,
    daysRemaining,
    memberType: memberRecord.memberType,
    renewalCount: memberRecord.renewalCount,
  };
}

/**
 * The hackathon a membership belongs to when the caller does not name one: the
 * edition actually running, and only once nothing is running the newest one by
 * start date. Next year's edition is drafted long before it runs, so ordering
 * by start date alone hands every membership lookup to a future draft the day
 * staff create it. Every membership read and write has to agree on this, or a
 * payment lands under one edition while the status lookup asks about another.
 */
export async function resolveHackathonId(
  db: DrizzleDB,
  inputId?: string,
): Promise<string | undefined> {
  if (inputId) return inputId;

  // Two sequential queries, and this now sits on hot paths (door check-in,
  // judge portal, every membership read). Which edition is current changes
  // about twice a year, so it is cached; "" stands for none, since a cache
  // miss also reads as null. Swept by the existing `hackathon*` invalidation.
  const cached = cache.get<string>(CURRENT_HACKATHON_KEY);
  if (cached !== null) return cached || undefined;

  // The rule itself lives in @query/db so the sign-in hook and the webhook run
  // the same one; this wrapper only adds the cache.
  const resolved = await resolveCurrentHackathonId(db);

  cache.set(CURRENT_HACKATHON_KEY, resolved ?? "", 60);

  return resolved;
}

/** Loads admin, judge, and member flags for the current user in one round-trip batch. */
export async function fetchPortalContext(
  db: DrizzleDB,
  userId: string,
): Promise<PortalContext> {
  const [admin, judgeRecord, leaderRecord] = await Promise.all([
    db.query.admins.findFirst({
      where: and(eq(admins.userId, userId), eq(admins.isActive, true)),
    }),
    db.query.judges.findFirst({
      where: and(eq(judges.userId, userId), eq(judges.isActive, true)),
      columns: { id: true, name: true },
    }),
    // Club side, so it does not wait on the edition and does not disappear
    // between editions the way it used to.
    db.query.projectLeaders.findFirst({
      where: and(
        eq(projectLeaders.userId, userId),
        eq(projectLeaders.isActive, true),
      ),
      columns: { id: true },
    }),
  ]);

  // Membership no longer depends on an edition resolving, so the portal knows
  // who is a member even when no hackathon is running.
  const memberRecord = await db.query.members.findFirst({
    where: eq(members.userId, userId),
  });
  const member = buildMemberContext(memberRecord ?? null);

  const isProjectLeader = !!leaderRecord;

  return {
    // A volunteer holds an admins row but is not staff. Reporting them as
    // admin here would render the whole admin nav for someone every one of
    // those pages rejects.
    isAdmin: isStaffRole(admin?.role),
    isScanner: !!admin,
    role: admin?.role ?? null,
    permissions: admin?.permissions ?? [],
    isJudge: !!judgeRecord,
    judgeId: judgeRecord?.id ?? null,
    judgeName: judgeRecord?.name ?? null,
    // Admins cover for leaders, and the middleware agrees — so the tab has to
    // appear for them too or staff see a page they are allowed to use but
    // cannot reach. isStaffRole, not `!!admin`: a volunteer holds an admins
    // row but isProjectLeader (procedures.ts) rejects them, so the bare truthy
    // check advertised /lead to the one role that cannot open it.
    isProjectLeader: isProjectLeader || isStaffRole(admin?.role),
    member,
  };
}

export { buildMemberContext };
