"use client";

import React, { useState, useEffect } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import {
  kicker,
  meta,
  page,
  pageTitle,
  status,
  tab as tabClass,
  tabList,
} from "@/components/portal/ui";
import { hackathonStatus } from "@/lib/hackathon-status";

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
  const conf = hackathonStatus(hackathon.status);
  const metaParts = [
    formatDateRange(hackathon.startDate, hackathon.endDate),
    hackathon.location,
    hackathon.maxParticipants
      ? `${hackathon.currentParticipants} of ${hackathon.maxParticipants} spots taken`
      : null,
  ].filter(Boolean);

  return (
    <main className={page}>
      <Link
        href="/hackathons"
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← All hackathons
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={status(conf.tone)}>{conf.label}</span>
          {myReg && <StatusBadge status={myReg.registrationStatus} />}
        </div>
        {hackathon.theme && (
          <p className={`mt-4 ${kicker}`}>{hackathon.theme}</p>
        )}
        <h1 className={`mt-1 ${pageTitle}`}>{hackathon.name}</h1>
        <p className={`mt-3 ${meta}`}>{metaParts.join(" · ")}</p>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Hackathon sections"
        className={`mt-8 scrollbar-none ${tabList}`}
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
            className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tabClass(tab === t.id)}`}
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
        className="mt-8"
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
            registrationStatus={myReg?.registrationStatus ?? null}
            myTeamId={myReg?.teamId ?? null}
          />
        )}
      </div>
    </main>
  );
}
