import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Code,
  ClipboardList,
  Users,
  BarChart3,
  QrCode,
  Zap,
  Home,
  Rocket,
  Upload,
  FolderGit2,
  CreditCard,
  ShieldCheck,
  BookOpen,
  GraduationCap,
  UserCircle,
  Calendar,
  UsersRound,
} from "lucide-react";
import type { PortalContext } from "@query/api";
import { hackathonPathSegment } from "./hackathon-slug";
import { isWithinEditionDates } from "./hackathon-next-step";

export type PortalNavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

export type PortalNavSection = {
  id: "hackathon" | "portal";
  label: string;
  items: PortalNavItem[];
};

/** The edition a hacker is in the middle of, as the nav needs it. */
export type NavHackathon = { id: string; name: string };

/** How many days before it starts an edition pulls focus in the nav. */
const NAV_LEAD_DAYS = 2;

type NavFlags = {
  isAdmin: boolean;
  isBugTester: boolean;
  isScanner: boolean;
  isJudge: boolean;
  isMember: boolean;
  isProjectLeader: boolean;
};

function flags(ctx: PortalContext | undefined | null): NavFlags {
  return {
    isAdmin: !!ctx?.isAdmin,
    isBugTester: !!ctx?.isBugTester,
    isScanner: !!ctx?.isScanner,
    isJudge: !!ctx?.isJudge,
    isMember: !!ctx?.member.isMember,
    isProjectLeader: !!ctx?.isProjectLeader,
  };
}

/**
 * The edition to put first in the nav: one the viewer is accepted to (or has
 * checked in at) that is running or starts within two days. Soonest first if
 * two qualify. Viewer's clock, day granularity.
 */
export function navHackathon(
  registrations:
    | readonly {
        registrationStatus: string;
        hackathon: {
          id: string;
          name: string;
          status: string;
          startDate: Date | string;
          endDate: Date | string;
        };
      }[]
    | null
    | undefined,
  now: Date,
): NavHackathon | null {
  const current = (registrations ?? [])
    .filter(
      (r) =>
        (r.registrationStatus === "approved" ||
          r.registrationStatus === "checked_in") &&
        r.hackathon.status !== "cancelled" &&
        isWithinEditionDates(r.hackathon, now, NAV_LEAD_DAYS),
    )
    .sort(
      (a, b) =>
        new Date(a.hackathon.startDate).getTime() -
        new Date(b.hackathon.startDate).getTime(),
    )[0];
  return current
    ? { id: current.hackathon.id, name: current.hackathon.name }
    : null;
}

/**
 * Sidebar is two columns of the org, not one dump: hackathon (open to anyone
 * with an account) and portal (club). Membership decides which portal links
 * appear; it does not mix the two back together.
 *
 * Staff see the same split on the admin tools. Judging Setup is gone — an
 * edition created from /admin/hackathons is the judging edition, and room
 * judging is run from /admin/judging.
 *
 * Club meetings (Hub, attendees, pass scan) stay on Portal. They are not a
 * tab or mode of a hackathon edition.
 *
 * While a hacker's edition is on (see `navHackathon`), "My <edition>" leads
 * the hackathon side. Nothing else moves: a member keeps every club link.
 * Staff keep their admin tools and never get it.
 */
export function portalNavSections(
  ctx: PortalContext | undefined | null,
  hackathon?: NavHackathon | null,
): PortalNavSection[] {
  const f = flags(ctx);

  // Bug testers browse the same admin tools read-only. The two links that
  // only staff can load at all (initiative ownership, the super-admin staff
  // page) are left out rather than shown as dead ends.
  if (f.isAdmin || f.isBugTester) {
    const staffOnly = new Set(["/lead", "/admin/staff"]);
    const sections: PortalNavSection[] = [
      {
        id: "hackathon",
        label: "Hackathon",
        items: [
          { name: "Hackathons", href: "/admin/hackathons", icon: Code },
          { name: "Judging", href: "/admin/judging", icon: ClipboardList },
          { name: "Projects", href: "/admin/projects", icon: FolderGit2 },
        ],
      },
      {
        id: "portal",
        label: "Portal",
        items: [
          { name: "Club Hub", href: "/admin", icon: LayoutDashboard },
          { name: "Club Attendees", href: "/admin/attendees", icon: Users },
          { name: "Club Attendance", href: "/scan/club", icon: Calendar },
          { name: "Club Projects", href: "/admin/initiatives", icon: Rocket },
          {
            name: "Club Project Applications",
            href: "/lead",
            icon: Rocket,
          },
          { name: "Subteams", href: "/admin/subteams", icon: UsersRound },
          { name: "Bootcamp", href: "/admin/bootcamp", icon: GraduationCap },
          { name: "Memberships", href: "/admin/members", icon: CreditCard },
          { name: "Resume Book", href: "/admin/resumes", icon: BookOpen },
          { name: "Staff & Roles", href: "/admin/staff", icon: ShieldCheck },
          { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
          { name: "Docs", href: "/docs", icon: BookOpen },
          { name: "Settings", href: "/settings", icon: UserCircle },
        ],
      },
    ];
    return f.isAdmin
      ? sections
      : sections.map((section) => ({
          ...section,
          items: section.items.filter((item) => !staffOnly.has(item.href)),
        }));
  }

  const hackathonItems: PortalNavItem[] = [
    ...(hackathon
      ? [
          {
            name: `My ${hackathon.name}`,
            href: `/hackathons/${hackathonPathSegment(hackathon.name, hackathon.id)}`,
            icon: Zap,
          },
        ]
      : []),
    // Non-members land on the hackathon half of /dashboard; members get the
    // same home link under Portal so the default section matches the default view.
    ...(!f.isMember
      ? [{ name: "Dashboard", href: "/dashboard", icon: Home }]
      : []),
    { name: "Hackathons", href: "/hackathons", icon: Zap },
    {
      name: "Submit Project",
      href: "/submit",
      icon: Upload,
    },
    ...(f.isJudge
      ? [{ name: "Judge Portal", href: "/judge", icon: ClipboardList }]
      : []),
    ...(f.isScanner
      ? [{ name: "Check-In Desk", href: "/scan", icon: QrCode }]
      : []),
  ];

  const portal: PortalNavItem[] = [
    ...(f.isMember
      ? [
          { name: "Dashboard", href: "/dashboard", icon: Home },
          { name: "Club Portal", href: "/club", icon: QrCode },
        ]
      : []),
    // Attendance is open to everyone; the Club Portal's scanner is not.
    { name: "Club Check-In", href: "/checkin", icon: QrCode },
    ...(f.isScanner
      ? [{ name: "Club Attendance", href: "/scan/club", icon: Calendar }]
      : []),
    { name: "Bootcamp", href: "/club/bootcamp", icon: GraduationCap },
    { name: "Club Projects", href: "/initiatives", icon: Rocket },
    ...(f.isMember
      ? [{ name: "Subteams", href: "/subteams", icon: UsersRound }]
      : []),
    ...(f.isProjectLeader
      ? [{ name: "My Club Projects", href: "/lead", icon: Rocket }]
      : []),
    { name: "Settings", href: "/settings", icon: UserCircle },
  ];

  return [
    { id: "hackathon", label: "Hackathon", items: hackathonItems },
    { id: "portal", label: "Portal", items: portal },
  ];
}

export function isPortalNavActive(
  pathname: string,
  href: string,
  allHrefs: readonly string[] = [],
): boolean {
  if (pathname === href) return true;
  // Prefixes that own a child route with its own nav item.
  if (
    href === "/dashboard" ||
    href === "/admin" ||
    href === "/club" ||
    href === "/scan"
  ) {
    return false;
  }
  if (!pathname.startsWith(`${href}/`)) return false;
  // A deeper item that matches too (My <edition> inside /hackathons) wins.
  return !allHrefs.some(
    (other) =>
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}
