import { admins, members, judges } from "@query/db";
import { eq, and } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import {
  EMPTY_MEMBER_CONTEXT,
  type MemberContext,
  type PortalContext,
} from "../types/portal-context";

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

/** Loads admin, judge, and member flags for the current user in one round-trip batch. */
export async function fetchPortalContext(
  db: DrizzleDB,
  userId: string,
): Promise<PortalContext> {
  const [admin, latestHackathon, judgeRecord] = await Promise.all([
    db.query.admins.findFirst({
      where: and(eq(admins.userId, userId), eq(admins.isActive, true)),
    }),
    db.query.hackathons.findFirst({
      orderBy: (h, { desc: descFn }) => [descFn(h.startDate)],
      columns: { id: true },
    }),
    db.query.judges.findFirst({
      where: and(eq(judges.userId, userId), eq(judges.isActive, true)),
      columns: { id: true, name: true },
    }),
  ]);

  let member = EMPTY_MEMBER_CONTEXT;

  if (latestHackathon?.id) {
    const memberRecord = await db.query.members.findFirst({
      where: and(
        eq(members.userId, userId),
        eq(members.hackathonId, latestHackathon.id),
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
