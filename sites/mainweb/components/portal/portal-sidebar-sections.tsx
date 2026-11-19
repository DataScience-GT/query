import {
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  Code,
  CreditCard,
  FolderGit2,
  GraduationCap,
  Home,
  LayoutDashboard,
  QrCode,
  Rocket,
  ShieldCheck,
  Upload,
  UserCircle,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PortalContext } from "@query/api";
import { navHackathon, portalNavSections } from "@/lib/portal-nav";
import type { PortalNavIcon } from "@/lib/portal-nav";
import type { PortalSidebarSection } from "./PortalSidebar";

const ICONS = {
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  Code,
  CreditCard,
  FolderGit2,
  GraduationCap,
  Home,
  LayoutDashboard,
  QrCode,
  Rocket,
  ShieldCheck,
  Upload,
  UserCircle,
  Users,
  UsersRound,
  Zap,
} satisfies Record<PortalNavIcon, LucideIcon>;

/**
 * The sidebar's nav for one viewer, drawn on the server. The icon library
 * stays out of the browser's bundle: each icon arrives as an element, and the
 * link around it sets `--nav-icon` to colour it for the active and hover state.
 */
export function portalSidebarSections(
  portal: PortalContext | undefined,
  registrations: Parameters<typeof navHackathon>[0],
): PortalSidebarSection[] {
  return portalNavSections(portal, navHackathon(registrations, new Date())).map(
    (section) => ({
      ...section,
      items: section.items.map(({ icon, ...item }) => {
        const Icon = ICONS[icon];
        return {
          ...item,
          icon: (
            <Icon
              strokeWidth={1.75}
              className="h-4 w-4 flex-shrink-0 text-[var(--nav-icon)]"
            />
          ),
        };
      }),
    }),
  );
}
