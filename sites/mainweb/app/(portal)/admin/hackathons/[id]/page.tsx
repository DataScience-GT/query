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
  BarChart3,
  Calendar,
  ChevronLeft,
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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "attendees",
      label: "Applications",
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: "events",
      label: "Events",
      icon: <Calendar className="w-5 h-5" />,
    },
    { id: "scanner", label: "Scan", icon: <ScanLine className="w-5 h-5" /> },
    {
      id: "analytics",
      label: "Stats",
      icon: <BarChart3 className="w-5 h-5" />,
    },
    { id: "judges", label: "Judges", icon: <Gavel className="w-5 h-5" /> },
    {
      id: "tables",
      label: "Table Cards",
      icon: <QrCode className="w-5 h-5" />,
    },
    {
      id: "announcements",
      label: "Email",
      icon: <Megaphone className="w-5 h-5" />,
    },
  ];

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)] flex flex-col pb-32 md:pb-12">
      <header className="relative sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Link
                href="/admin/hackathons"
                className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-accent mb-1"
                aria-label="Back to hackathons hub"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Hackathons</span>
              </Link>
              <h1 className="text-lg md:text-2xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase truncate">
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                >
                  <ScanLine className="w-4 h-4 shrink-0" />
                  Scan
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* DESKTOP TABS - Hidden on mobile */}
      <div className="hidden md:block border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/30">
        <div className="max-w-7xl mx-auto px-4 flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-h-[56px] flex items-center justify-center gap-3 px-4 py-4 text-sm font-bold uppercase tracking-widest transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 md:p-6 min-h-[calc(100vh-200px)]">
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)]/98 backdrop-blur-2xl border-t border-[var(--border-subtle)] z-40 flex overflow-x-auto pb-safe [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 basis-1/5 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
              activeTab === tab.id ? "text-accent" : "text-[var(--text-muted)]"
            }`}
          >
            <div
              className={`p-2 rounded-sm transition-colors ${activeTab === tab.id ? "bg-accent/10" : ""}`}
            >
              {tab.icon}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {tab.label}
            </span>
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
      <div className="w-full max-w-md text-center rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8">
        <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-3">
          Hackathon unavailable
        </h1>
        <p className="text-sm text-[var(--text-muted)] mb-6 break-words">
          {message}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
            >
              Retry
            </button>
          )}
          <Link
            href="/admin/hackathons"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
          >
            Back to hackathons
          </Link>
        </div>
      </div>
    </div>
  );
}
