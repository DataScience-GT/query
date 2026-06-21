export type MemberContext = {
  isMember: boolean;
  isActive: boolean | null;
  expiresAt: Date | null;
  daysRemaining: number | null;
  memberType: string | null;
  renewalCount: number;
};

export type PortalContext = {
  isAdmin: boolean;
  role: string | null;
  permissions: string[];
  isJudge: boolean;
  judgeId: string | null;
  judgeName: string | null;
  member: MemberContext;
};

export const EMPTY_MEMBER_CONTEXT: MemberContext = {
  isMember: false,
  isActive: false,
  expiresAt: null,
  daysRemaining: null,
  memberType: null,
  renewalCount: 0,
};
