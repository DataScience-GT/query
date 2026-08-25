export type MemberContext = {
  // Membership is a paid year, so this is true only while one is paid for and
  // unexpired. It used to be true for any `member` row, so a lapsed member read
  // as active, got into /club, and had the only payment button hidden behind
  // the same flag — leaving them no way to renew.
  isMember: boolean;
  isActive: boolean | null;
  /** Had a membership, and it ran out. Drives the renew prompt. */
  hasLapsed: boolean;
  expiresAt: Date | null;
  daysRemaining: number | null;
  memberType: string | null;
  renewalCount: number;
};

// Full staff, as opposed to a volunteer. Lives here because both the
// middleware and the portal context need it, and procedures.ts already
// imports from the portal-context service — putting it there closes a cycle.
export const isStaffRole = (role: string | null | undefined) =>
  !!role && role !== "volunteer";

// A fixed-term appointment that has run out. Checked here rather than in each
// query's WHERE so the row still comes back: the staff page has to show an
// expired term to renew it. NULL is a standing appointment.
export const isExpiredAdmin = (
  admin: { expiresAt: Date | null } | null | undefined,
) => !!admin?.expiresAt && admin.expiresAt.getTime() <= Date.now();

export type PortalContext = {
  // Full staff. False for volunteers, who hold an admins row but are limited to
  // badge scanning.
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
