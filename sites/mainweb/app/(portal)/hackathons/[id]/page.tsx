"use client";

import React, { useState, useEffect } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import { Calendar, ChevronLeft, MapPin, Users } from "lucide-react";

// Extracted Tab Components
import { InfoTab } from "@/components/hackathon/InfoTab";
import { ScheduleTab } from "@/components/hackathon/ScheduleTab";
import { ProjectsTab } from "@/components/hackathon/ProjectsTab";
import { ResultsTab } from "@/components/hackathon/ResultsTab";
import { TeamsTab } from "@/components/hackathon/TeamsTab";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { HackathonUnavailable } from "@/components/hackathon/HackathonUnavailable";
import { decodeHackathonParam } from "@/lib/hackathon-slug";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start: Date | string, end: Date | string) {
  const s = new Date(start);
  const e = new Date(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
  }
  return `${formatDate(s)} - ${formatDate(e)}`;
}

function statusConfig(s: string) {
  const map: Record<string, { label: string; color: string }> = {
    draft: {
      label: "Not published",
      color:
        "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    },
    announced: {
      label: "Opens soon",
      color:
        "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    },
    open: {
      label: "Registration open",
      color: "text-accent bg-accent/10 border-accent/25",
    },
    in_progress: {
      label: "Live",
      color: "text-accent bg-accent/10 border-accent/25",
    },
    completed: {
      label: "Completed",
      color:
        "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    },
    closed: {
      label: "Registration closed",
      color: "text-amber-400 bg-amber-400/10 border-amber-400/30",
    },
    cancelled: {
      label: "Cancelled",
      color: "text-rose-500 bg-rose-500/10 border-rose-500/30",
    },
  };
  return (
    map[s] ?? {
      label: s.replace(/_/g, " "),
      color:
        "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    }
  );
}

type TabType = "INFO" | "SCHEDULE" | "PROJECTS" | "TEAMS" | "RESULTS";

const TABS: { id: TabType; label: string }[] = [
  { id: "INFO", label: "Overview" },
  { id: "SCHEDULE", label: "Schedule & pass" },
  { id: "PROJECTS", label: "Projects" },
  { id: "TEAMS", label: "Teams" },
  { id: "RESULTS", label: "Results" },
];

export default function HackathonDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = params.id;
  const hackathonId = decodeHackathonParam(
    Array.isArray(rawId) ? (rawId[0] ?? "") : ((rawId as string | undefined) ?? ""),
  );

  const tabParam = searchParams.get("tab") as TabType | null;
  const [tab, setTab] = useState<TabType>(
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "INFO",
  );

  // Keep the tab in the URL so refreshing, sharing and Back all work.
  const selectTab = (next: TabType) => {
    setTab(next);
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("tab", next);
    router.replace(`?${qs.toString()}`, { scroll: false });
  };

  const {
    data: hackathon,
    isLoading,
    error,
  } = trpc.hackathon.getById.useQuery({
    id: hackathonId,
  });
  const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, {
    enabled: !!session,
  });

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(loginHref());
  }, [authStatus, router]);

  if (authStatus === "loading" || isLoading)
    return <LoadingScreen message="Loading hackathon…" />;
  if (!session) return null;
  // A hackathon can be missing (bad link, deleted event) or hidden. Without
  // this branch the loading guard below never clears and the page spins
  // forever with nothing to click.
  if (error || !hackathon) return <HackathonUnavailable message={error?.message} />;

  const myReg = myRegs?.find((r) => r.hackathonId === hackathon.id);
  const isRegistered = !!myReg;
  const conf = statusConfig(hackathon.status);

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10 space-y-8">
        <Link
          href="/hackathons"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-accent"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          All hackathons
        </Link>

        {/* Header Card */}
        <LiquidGlass printed className="p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border ${conf.color}`}
            >
              {conf.label}
            </span>

            {myReg && <StatusBadge status={myReg.registrationStatus} />}

            {hackathon.theme && (
              <span className="text-[11px] text-accent/80 uppercase tracking-wider">
                {hackathon.theme}
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-4">
            {hackathon.name}
          </h1>

          <div className="flex flex-wrap items-center gap-5 text-sm text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
              <span>{formatDateRange(hackathon.startDate, hackathon.endDate)}</span>
            </div>

            {hackathon.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                <span>{hackathon.location}</span>
              </div>
            )}

            {hackathon.maxParticipants && (
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                <span>
                  {hackathon.currentParticipants} of {hackathon.maxParticipants}{" "}
                  spots taken
                </span>
              </div>
            )}
          </div>
        </LiquidGlass>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Hackathon sections"
          className="flex max-w-full overflow-x-auto scrollbar-none w-fit rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => selectTab(t.id)}
              className={`rounded-sm px-5 py-2 text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                tab === t.id
                  ? "bg-accent/15 text-accent"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "INFO" ? (
            <InfoTab
              hackathon={hackathon}
              isRegistered={isRegistered}
              myReg={myReg}
            />
          ) : tab === "SCHEDULE" ? (
            <ScheduleTab
              hackathonId={hackathon.id}
              isRegistered={isRegistered}
            />
          ) : tab === "RESULTS" ? (
            <ResultsTab hackathonId={hackathon.id} />
          ) : tab === "PROJECTS" ? (
            <ProjectsTab hackathonId={hackathon.id} />
          ) : (
            <TeamsTab
              hackathonId={hackathon.id}
              isRegistered={isRegistered}
              myTeamId={myReg?.teamId ?? null}
            />
          )}
        </div>
      </main>
    </div>
  );
}
