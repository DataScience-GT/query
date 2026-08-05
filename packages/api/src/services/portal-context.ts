import { admins, members, judges } from "@query/db";
import { eq, and } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { cache } from "../middleware/cache";
import { EMPTY_MEMBER_CONTEXT } from "../types/portal-context";
import type { MemberContext, PortalContext } from "../types/portal-context";

const CURRENT_HACKATHON_KEY = "hackathon:current-id";

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
    isMember: true,
    isActive,
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

  const now = new Date();

  const inProgress = await db.query.hackathons.findFirst({
    where: (h, { and: andFn, ne, lte, gte }) =>
      andFn(ne(h.status, "draft"), lte(h.startDate, now), gte(h.endDate, now)),
    columns: { id: true },
  });

  const resolved =
    inProgress ??
    (await db.query.hackathons.findFirst({
      orderBy: (h, { desc: descFn }) => [descFn(h.startDate)],
      columns: { id: true },
    }));

  cache.set(CURRENT_HACKATHON_KEY, resolved?.id ?? "", 60);

  return resolved?.id;
}

/** Loads admin, judge, and member flags for the current user in one round-trip batch. */
export async function fetchPortalContext(
  db: DrizzleDB,
  userId: string,
): Promise<PortalContext> {
  const [admin, hackathonId, judgeRecord] = await Promise.all([
    db.query.admins.findFirst({
      where: and(eq(admins.userId, userId), eq(admins.isActive, true)),
    }),
    resolveHackathonId(db),
    db.query.judges.findFirst({
      where: and(eq(judges.userId, userId), eq(judges.isActive, true)),
      columns: { id: true, name: true },
    }),
  ]);

  let member = EMPTY_MEMBER_CONTEXT;

  if (hackathonId) {
    const memberRecord = await db.query.members.findFirst({
      where: and(
        eq(members.userId, userId),
        eq(members.hackathonId, hackathonId),
      ),
    });
    member = buildMemberContext(memberRecord ?? null);
  }

  return {
    isAdmin: !!admin,
    role: admin?.role ?? null,
    permissions: admin?.permissions ?? [],
    isJudge: !!judgeRecord,
    judgeId: judgeRecord?.id ?? null,
    judgeName: judgeRecord?.name ?? null,
    member,
  };
}

export { buildMemberContext };
