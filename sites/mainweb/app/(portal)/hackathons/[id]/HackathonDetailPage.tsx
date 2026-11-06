"use client";

import React, {
  useState,
  useEffect,
  useOptimistic,
  useRef,
  startTransition,
} from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import {
  meta,
  page,
  pageDek,
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
import { HackerJudgingTab } from "@/components/hackathon/judging/HackerJudgingTab";
import { PointsTab } from "@/components/hackathon/points/PointsTab";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { HackathonUnavailable } from "@/components/hackathon/HackathonUnavailable";
import { HackerAnnouncements } from "@/components/hackathon/HackerAnnouncements";
import { NextStepStrip } from "@/components/hackathon/NextStepStrip";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import {
  hackathonNextStep,
  nextStepQueries,
  projectSubmitted,
} from "@/lib/hackathon-next-step";

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

type TabType =
  | "INFO"
  | "SCHEDULE"
  | "PROJECTS"
  | "TEAMS"
  | "JUDGING"
  | "POINTS"
  | "RESULTS";

const TABS: { id: TabType; label: string }[] = [
  { id: "INFO", label: "Overview" },
  { id: "SCHEDULE", label: "Schedule & pass" },
  { id: "PROJECTS", label: "Projects" },
  { id: "TEAMS", label: "Teams" },
  { id: "JUDGING", label: "Judging" },
  { id: "POINTS", label: "Points" },
  { id: "RESULTS", label: "Results" },
];

// Nothing to judge, score or announce before the event runs, so these stay
// out of the strip until it does.
const EVENT_TABS = new Set<TabType>(["JUDGING", "POINTS", "RESULTS"]);
const EVENT_STATUSES = new Set(["in_progress", "completed"]);

// The strip's right edge fades out so on a phone it hints at the tabs past it.
const tabFade =
  "[mask-image:linear-gradient(to_right,#000_calc(100%_-_1.5rem),transparent)]";

// Day granularity, on the viewer's clock: the last day counts all day.
const startOfDay = (d: Date | string) => new Date(d).setHours(0, 0, 0, 0);

export default function HackathonDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = params.id;
  const hackathonId = decodeHackathonParam(
    Array.isArray(rawId) ? (rawId[0] ?? "") : ((rawId as string | undefined) ?? ""),
  );

  // The URL is the only source of the tab, so a same-page ?tab= link works.
  // The optimistic copy shows a clicked tab at once instead of after the
  // navigation lands, then hands back to whatever the URL says.
  const tabParam = searchParams.get("tab");
  const urlTab = TABS.find((t) => t.id === tabParam)?.id ?? "INFO";
  const [shownTab, setShownTab] = useOptimistic<TabType>(urlTab);

  // Keep the tab in the URL so refreshing, sharing and Back all work.
  const selectTab = (next: TabType) => {
    startTransition(() => {
      setShownTab(next);
      const qs = new URLSearchParams(searchParams.toString());
      qs.set("tab", next);
      router.replace(`?${qs.toString()}`, { scroll: false });
    });
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
    // An accepted hacker is waiting on the door scan. While the event runs,
    // re-read so the page flips to checked in without a reload.
    refetchInterval: (query) => {
      const today = startOfDay(new Date());
      return query.state.data?.some(
        (r) =>
          r.hackathonId === hackathon?.id &&
          r.registrationStatus === "approved" &&
          startOfDay(r.hackathon.startDate) <= today &&
          today <= startOfDay(r.hackathon.endDate),
      )
        ? 30_000
        : false;
    },
  });

  const myReg = myRegs?.find((r) => r.hackathonId === hackathon?.id);

  // Only a flip seen while the page is open counts; the status it first
  // loaded with never announces itself.
  const regStatus = myReg?.registrationStatus;
  const [seenStatus, setSeenStatus] = useState(regStatus);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  if (regStatus !== seenStatus) {
    setSeenStatus(regStatus);
    if (regStatus === "checked_in" && seenStatus) setJustCheckedIn(true);
  }
  useEffect(() => {
    if (!justCheckedIn) return;
    const timer = setTimeout(() => setJustCheckedIn(false), 10_000);
    return () => clearTimeout(timer);
  }, [justCheckedIn]);

  // The next-step strip reads up to four more queries, each held back until
  // the step can use it, so only a registered hacker at the right point pays.
  // oxlint-disable-next-line react/purity
  const now = new Date();
  const needs =
    hackathon && regStatus
      ? nextStepQueries({ now, hackathon, registrationStatus: regStatus })
      : { submission: false, judging: false, results: false };
  const stepId = hackathon?.id ?? "";
  const submissionWindow = trpc.team.submissionWindow.useQuery(
    { hackathonId: stepId },
    { enabled: needs.submission },
  );
  const mySubmission = trpc.team.mySubmission.useQuery(
    { hackathonId: stepId },
    { enabled: needs.submission },
  );
  const itinerary = trpc.judging.hacker.itinerary.useQuery(
    { hackathonId: stepId },
    { enabled: needs.judging },
  );
  const results = trpc.hackathon.getResults.useQuery(
    { hackathonId: stepId },
    { enabled: needs.results },
  );
  // Held back until they answer, so the strip never shows a step it is about
  // to take back ("Submit" to somebody who already has).
  const stepLoading =
    submissionWindow.isLoading ||
    mySubmission.isLoading ||
    itinerary.isLoading ||
    results.isLoading;

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(loginHref());
  }, [authStatus, router]);

  // The strip scrolls sideways on a phone, so a ?tab= link to a later tab
  // would land with it and its accent rule past the right edge. Scroll the
  // strip itself: scrollIntoView would move the page too. `tabsMounted` is the
  // render the strip first exists in; the tab alone does not change then.
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabsMounted =
    authStatus !== "loading" && !isLoading && !!session && !error && !!hackathon;
  useEffect(() => {
    const list = tabsRef.current;
    const el = list?.querySelector<HTMLElement>(`#tab-${shownTab}`);
    if (!list || !el) return;
    const clipped =
      el.offsetLeft < list.scrollLeft ||
      el.offsetLeft + el.offsetWidth > list.scrollLeft + list.clientWidth - 24;
    if (clipped) list.scrollLeft = Math.max(0, el.offsetLeft - 24);
  }, [shownTab, tabsMounted]);

  if (authStatus === "loading" || isLoading)
    return <LoadingScreen message="Loading hackathon…" />;
  if (!session) return null;
  // A hackathon can be missing (bad link, deleted event) or hidden. Without
  // this branch the loading guard below never clears and the page spins
  // forever with nothing to click.
  if (error || !hackathon) return <HackathonUnavailable message={error?.message} />;

  const isRegistered = !!myReg;
  const nextStep =
    myReg && !stepLoading
      ? hackathonNextStep({
          now,
          hackathon,
          registrationStatus: myReg.registrationStatus,
          hasTeam: !!myReg.teamId,
          submissionWindow: submissionWindow.data,
          submitted: projectSubmitted(mySubmission.data),
          itinerary: itinerary.data,
          resultsPublished: (results.data?.length ?? 0) > 0,
        })
      : null;
  // The status is moved by hand, so the start date counts too: an edition
  // still marked closed on the weekend itself must not hide Judging.
  const eventLive =
    EVENT_STATUSES.has(hackathon.status) ||
    (hackathon.status !== "cancelled" &&
      // oxlint-disable-next-line react/purity
      startOfDay(hackathon.startDate) <= startOfDay(new Date()));
  const tabs = eventLive ? TABS : TABS.filter((t) => !EVENT_TABS.has(t.id));
  // A ?tab= for a tab that is not shown yet falls back to the overview.
  const tab = tabs.some((t) => t.id === shownTab) ? shownTab : "INFO";
  const conf = hackathonStatus(hackathon.status);

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
        <h1 className={`mt-3 ${pageTitle}`}>{hackathon.name}</h1>
        {hackathon.theme && <p className={pageDek}>{hackathon.theme}</p>}
        <p className={`mt-3 ${meta}`}>
          {[
            formatDateRange(hackathon.startDate, hackathon.endDate),
            hackathon.location,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {hackathon.maxParticipants ? (
          <p className={meta}>
            {`${hackathon.currentParticipants} of ${hackathon.maxParticipants} spots taken`}
          </p>
        ) : null}
        {nextStep && <NextStepStrip step={nextStep} className="mt-6" />}
      </header>

      {/* Mounted empty so screen readers announce the line when it lands. */}
      <div role="status">
        {justCheckedIn && (
          <p className="mt-6 border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
            You&apos;re checked in.
          </p>
        )}
      </div>

      {/* What organisers announced to this hacker, emailed or in app only.
          The uuid, not the route param: that may be a slug. */}
      {regStatus && <HackerAnnouncements hackathonId={hackathon.id} />}

      {/* Tabs. The end padding lets the last tab scroll clear of the fade. */}
      <div
        role="tablist"
        aria-label="Hackathon sections"
        ref={tabsRef}
        className={`relative mt-8 pr-6 scrollbar-none ${tabList} ${tabFade}`}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => selectTab(t.id)}
            className={`shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tabClass(tab === t.id)}`}
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
            startDate={hackathon.startDate}
            endDate={hackathon.endDate}
            pointsTabShown={eventLive}
          />
        ) : tab === "JUDGING" ? (
          <HackerJudgingTab hackathonId={hackathon.id} />
        ) : tab === "POINTS" ? (
          <PointsTab hackathonId={hackathon.id} />
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
