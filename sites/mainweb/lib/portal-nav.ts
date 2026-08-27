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
  ScrollText,
  BookOpen,
  GraduationCap,
  UserCircle,
  Calendar,
} from "lucide-react";
import type { PortalContext } from "@query/api";

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

type NavFlags = {
  isAdmin: boolean;
  isScanner: boolean;
  isJudge: boolean;
  isMember: boolean;
  isProjectLeader: boolean;
};

function flags(ctx: PortalContext | undefined | null): NavFlags {
  return {
    isAdmin: !!ctx?.isAdmin,
    isScanner: !!ctx?.isScanner,
    isJudge: !!ctx?.isJudge,
    isMember: !!ctx?.member.isMember,
    isProjectLeader: !!ctx?.isProjectLeader,
  };
}

/**
 * Sidebar is two columns of the org, not one dump: hackathon (open to anyone
 * with an account) and portal (club). Membership decides which portal links
 * appear; it does not mix the two back together.
 *
 * Staff see the same split on the admin tools. Judging Setup is gone — an
 * edition created from /admin/hackathons is the judging edition, and queue
 * prep lives on /admin/judging.
 *
 * Club meetings (Hub, attendees, pass scan) stay on Portal. They are not a
 * tab or mode of a hackathon edition.
 */
export function portalNavSections(
  ctx: PortalContext | undefined | null,
): PortalNavSection[] {
  const f = flags(ctx);

  if (f.isAdmin) {
    return [
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
          { name: "Club Check-In", href: "/scan/club", icon: Calendar },
          { name: "Initiatives", href: "/admin/initiatives", icon: Rocket },
          {
            name: "Initiative Applications",
            href: "/lead",
            icon: Rocket,
          },
          { name: "Bootcamp", href: "/admin/bootcamp", icon: GraduationCap },
          { name: "Memberships", href: "/admin/members", icon: CreditCard },
          { name: "Staff & Roles", href: "/admin/staff", icon: ShieldCheck },
          { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
          { name: "Audit Log", href: "/admin/audit", icon: ScrollText },
          { name: "Docs", href: "/docs", icon: BookOpen },
          { name: "Settings", href: "/settings", icon: UserCircle },
        ],
      },
    ];
  }

  const hackathon: PortalNavItem[] = [
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
    ...(f.isScanner
      ? [{ name: "Club Check-In", href: "/scan/club", icon: Calendar }]
      : []),
    { name: "Bootcamp", href: "/club/bootcamp", icon: GraduationCap },
    { name: "Initiatives", href: "/initiatives", icon: Rocket },
    ...(f.isProjectLeader
      ? [{ name: "My Initiatives", href: "/lead", icon: Rocket }]
      : []),
    { name: "Settings", href: "/settings", icon: UserCircle },
  ];

  return [
    { id: "hackathon", label: "Hackathon", items: hackathon },
    { id: "portal", label: "Portal", items: portal },
  ];
}

export function isPortalNavActive(pathname: string, href: string): boolean {
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
  return pathname.startsWith(`${href}/`);
}
