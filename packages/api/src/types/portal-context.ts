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

/**
 * Full staff, as opposed to a volunteer.
 *
 * Lives here rather than beside the middleware because both the middleware and
 * the portal context need it, and procedures.ts already imports from the
 * portal-context service — putting it there would close an import cycle.
 */
export const isStaffRole = (role: string | null | undefined) =>
  !!role && role !== "volunteer";

/**
 * A fixed-term appointment that has run out.
 *
 * Checked here rather than in each query's WHERE clause so the row still comes
 * back: the staff page has to show an expired term to renew it, and a gate that
 * filtered it out in SQL would report the person as never having been staff.
 * NULL is a standing appointment and never expires.
 */
export const isExpiredAdmin = (
  admin: { expiresAt: Date | null } | null | undefined,
) => !!admin?.expiresAt && admin.expiresAt.getTime() <= Date.now();

export type PortalContext = {
  /** Full staff. False for volunteers, who hold an admins row but are limited
   *  to badge scanning. */
  isAdmin: boolean;
  /** Any active admins row, volunteers included — may staff a check-in desk. */
  isScanner: boolean;
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
