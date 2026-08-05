export type MemberContext = {
  /**
   * Membership is a paid year, so this is true only while one is paid for and
   * unexpired. It used to be true for any `member` row at all, which meant a
   * lapsed member still read as a member: the portal called them "Active
   * Member", let them into /club, and hid the only payment button behind the
   * same flag — leaving them no way to renew.
   */
  isMember: boolean;
  isActive: boolean | null;
  /** Had a membership, and it ran out. Drives the renew prompt. */
  hasLapsed: boolean;
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
  /** Runs club initiatives for the current edition. Not a staff role. */
  isProjectLeader: boolean;
  member: MemberContext;
};

export const EMPTY_MEMBER_CONTEXT: MemberContext = {
  isMember: false,
  isActive: false,
  hasLapsed: false,
  expiresAt: null,
  daysRemaining: null,
  memberType: null,
  renewalCount: 0,
};
