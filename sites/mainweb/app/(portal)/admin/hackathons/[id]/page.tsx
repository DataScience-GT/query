"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { ScannerTab } from "@/components/admin/hackathons/ScannerTab";
import { AttendeesTab } from "@/components/admin/hackathons/AttendeesTab";
import { AnalyticsTab } from "@/components/admin/hackathons/AnalyticsTab";
import { EventsTab } from "@/components/admin/hackathons/EventsTab";
import { JudgesTab } from "@/components/admin/hackathons/JudgesTab";
import { AnnouncementsTab } from "@/components/admin/hackathons/AnnouncementsTab";
import { TableCards } from "@/components/admin/hackathons/TableCards";
import {
  body,
  btnPrimary,
  btnSecondary,
  sectionTitle,
  tab as tabClass,
  tabList,
} from "@/components/portal/ui";
import {
  BarChart3,
  Calendar,
  Gavel,
  Megaphone,
  QrCode,
  ScanLine,
  Users,
} from "lucide-react";

type Tab =
  | "events"
  | "scanner"
  | "attendees"
  | "analytics"
  | "judges"
  | "announcements"
  | "tables";

export default function AdminHackathonDashboard() {
  const { status } = useSession();
  const params = useParams();
  const rawId = params?.id;
  const hackathonId = decodeHackathonParam(
    Array.isArray(rawId) ? (rawId[0] ?? "") : ((rawId as string | undefined) ?? ""),
  );
  const [activeTab, setActiveTab] = useState<Tab>("attendees");

  const { data: portalContext, isLoading: portalLoading } = usePortalContext();
  const {
    data: hackathon,
    isLoading,
    error,
    refetch,
  } = trpc.hackathon.getById.useQuery(
    { id: hackathonId },
    { enabled: !!hackathonId && !!portalContext?.isAdmin },
  );

  // isLoading is false on the render where the query flips enabled but has not
  // started fetching, and it is false again once the query has errored. Both
  // used to fall through to a bare `return null`, which paints the dashboard as
  // an unexplained black screen instead of a spinner or the actual failure.
  const settled = !!hackathon || !!error;

  if (status === "loading" || portalLoading) {
    return <LoadingScreen message="Loading…" />;
  }

  // Not found rather than a permission error: telling a non-admin that this
  // edition exists behind a door they cannot open is the whole leak, and the
  // query is disabled for them anyway, so waiting on it spun forever.
  if (!portalContext?.isAdmin) {
    return <DashboardUnavailable message="Hackathon not found" />;
  }

  if (isLoading || !settled) {
    return <LoadingScreen message="Loading…" />;
  }

  if (!hackathon) {
    return (
      <DashboardUnavailable
        message={error?.message ?? "Hackathon not found"}
        onRetry={() => refetch()}
      />
    );
  }

  const icon = { className: "w-4 h-4", strokeWidth: 1.75, "aria-hidden": true } as const;
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "attendees",
      label: "Applications",
      icon: <Users {...icon} />,
    },
    {
      id: "events",
      label: "Events",
      icon: <Calendar {...icon} />,
    },
    { id: "scanner", label: "Scan", icon: <ScanLine {...icon} /> },
    {
      id: "analytics",
      label: "Stats",
      icon: <BarChart3 {...icon} />,
    },
    { id: "judges", label: "Judges", icon: <Gavel {...icon} /> },
    {
      id: "tables",
      label: "Table cards",
      icon: <QrCode {...icon} />,
    },
    {
      id: "announcements",
      label: "Email",
      icon: <Megaphone {...icon} />,
    },
  ];

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)] flex flex-col pb-32 md:pb-12">
      <header className="relative sticky top-0 z-30 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] md:border-b-0">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-4 md:pb-0">
          <div className="flex items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Link
                href="/admin/hackathons"
                className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Back to hackathons hub"
              >
                ← <span className="hidden md:inline">All hackathons</span>
              </Link>
              <h1 className="mt-2 truncate font-[family-name:var(--font-display)] text-[28px] md:text-[40px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                {hackathon.name}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {["scanner", "attendees"].includes(activeTab) && (
                // ScannerTab is rendered on this page; there is no
                // /admin/hackathons/[id]/scanner route to link to.
                <button
                  type="button"
                  onClick={() => setActiveTab("scanner")}
                  className={btnSecondary}
                >
                  <ScanLine className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  Scan
                </button>
              )}
            </div>
          </div>

          {/* DESKTOP TABS - Hidden on mobile */}
          <div className={`hidden md:flex mt-6 ${tabList}`}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tabClass(activeTab === tab.id)}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 px-4 py-6 md:py-8 min-h-[calc(100vh-200px)]">
        <div className="max-w-7xl mx-auto w-full">
          {activeTab === "events" && <EventsTab hackathonId={hackathon.id} />}
          {activeTab === "scanner" && <ScannerTab hackathonId={hackathon.id} />}
          {activeTab === "attendees" && (
            <AttendeesTab
              hackathonId={hackathon.id}
              hackathonName={hackathon.name}
              status={hackathon.status}
            />
          )}
          {activeTab === "analytics" && (
            <AnalyticsTab hackathonId={hackathon.id} />
          )}
          {activeTab === "judges" && <JudgesTab hackathonId={hackathon.id} />}
          {activeTab === "tables" && <TableCards hackathonId={hackathon.id} />}
          {activeTab === "announcements" && (
            <AnnouncementsTab hackathonId={hackathon.id} />
          )}
        </div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      {/* Scrolls horizontally rather than a fixed 5-column grid: there are
          seven tabs, so Table Cards and Email were laid out off the right edge
          of the phone an organiser actually carries — unreachable, with nothing
          to suggest they existed. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)] border-t border-[var(--border-subtle)] z-40 flex overflow-x-auto pb-safe [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 basis-1/5 flex flex-col items-center justify-center gap-1 border-t-2 -mt-px py-3 transition-colors ${
              activeTab === tab.id
                ? "border-accent text-[var(--text-primary)] font-semibold"
                : "border-transparent text-[var(--text-muted)]"
            }`}
          >
            {tab.icon}
            <span className="text-[12px]">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className={sectionTitle}>Hackathon unavailable</h1>
        <p className={`mt-3 break-words ${body}`}>{message}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className={btnPrimary}>
              Try again
            </button>
          )}
          <Link href="/admin/hackathons" className={btnSecondary}>
            Back to hackathons
          </Link>
        </div>
      </div>
    </div>
  );
}
