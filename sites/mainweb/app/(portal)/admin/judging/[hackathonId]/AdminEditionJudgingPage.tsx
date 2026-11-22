"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  adminPage,
  adminTitle,
  body,
  btnSecondary,
  kicker,
  meta,
  status,
  tab,
  tabList,
} from "@query/ui/classes";
import type { Tone } from "@query/ui/classes";
import {
  OFFICER_POLL_MS,
  SECTIONS,
  plural,
  stationCount,
} from "@/components/admin/judging/shared";
import type { Overview, SectionId } from "@/components/admin/judging/shared";
import { ChecklistSection } from "@/components/admin/judging/ChecklistSection";

// One edition's judging console. The section lives in the URL hash so the
// checklist can link straight to the part that needs work and a reload keeps
// the organiser where they were. AdminLayout gates this page to staff.

// The checklist is the default section, so it ships with the page. The rest
// load when opened: pointing at or focusing a section's link fetches its chunk,
// and a page opened on a section's hash starts fetching it straight away.
const loadProjects = () => import("@/components/admin/judging/ProjectsSection").then((m) => m.ProjectsSection);
const loadChallenges = () => import("@/components/admin/judging/ChallengesSection").then((m) => m.ChallengesSection);
const loadRooms = () => import("@/components/admin/judging/RoomsSection").then((m) => m.RoomsSection);
const loadRubric = () => import("@/components/admin/judging/RubricSection").then((m) => m.RubricSection);
const loadLaunch = () => import("@/components/admin/judging/LaunchSection").then((m) => m.LaunchSection);
const loadSchedule = () => import("@/components/admin/judging/schedule/ScheduleTab").then((m) => m.ScheduleTab);
const loadClaims = () => import("@/components/admin/judging/claims/ClaimsPanel").then((m) => m.ClaimsPanel);
const loadResults = () => import("@/components/admin/judging/results/ResultsTab").then((m) => m.ResultsTab);
const loadRepoCheck = () => import("@/components/admin/judging/RepoCheckSection").then((m) => m.RepoCheckSection);
const loadAnnouncements = () => import("@/components/admin/judging/AnnouncementsSection").then((m) => m.AnnouncementsSection);
const loadDanger = () => import("@/components/admin/judging/DangerZone").then((m) => m.DangerZone);

const SectionLoading = () => <p className={body}>Loading…</p>;
const ProjectsSection = dynamic(loadProjects, { loading: SectionLoading });
const ChallengesSection = dynamic(loadChallenges, { loading: SectionLoading });
const RoomsSection = dynamic(loadRooms, { loading: SectionLoading });
const RubricSection = dynamic(loadRubric, { loading: SectionLoading });
const LaunchSection = dynamic(loadLaunch, { loading: SectionLoading });
const JudgingSchedule = dynamic(loadSchedule, { loading: SectionLoading });
const JudgingClaims = dynamic(loadClaims, { loading: SectionLoading });
const JudgingResults = dynamic(loadResults, { loading: SectionLoading });
const RepoCheckSection = dynamic(loadRepoCheck, { loading: SectionLoading });
const AnnouncementsSection = dynamic(loadAnnouncements, { loading: SectionLoading });
const DangerZone = dynamic(loadDanger, { loading: SectionLoading });

const LOADERS: Record<Exclude<SectionId, "checklist">, () => Promise<unknown>> = {
  projects: loadProjects,
  challenges: loadChallenges,
  rooms: loadRooms,
  rubric: loadRubric,
  launch: loadLaunch,
  schedule: loadSchedule,
  claims: loadClaims,
  results: loadResults,
  "repo-check": loadRepoCheck,
  announcements: loadAnnouncements,
  danger: loadDanger,
};

// A failed warm-up is not the click's failure: opening the section retries the
// import, and the error boundary takes it from there.
function preloadSection(id: SectionId) {
  if (id !== "checklist") LOADERS[id]().catch(() => {});
}

const sectionOf = (hash: string): SectionId =>
  SECTIONS.find((s) => s.id === hash)?.id ?? "checklist";

if (typeof window !== "undefined") {
  preloadSection(sectionOf(window.location.hash.slice(1)));
}

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

function useSection(): SectionId {
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.slice(1),
    () => "",
  );
  return sectionOf(hash);
}

const STATE: Record<Overview["config"]["state"], { label: string; tone: Tone }> =
  {
    draft: { label: "Draft", tone: "neutral" },
    open: { label: "Open", tone: "success" },
    closed: { label: "Closed", tone: "warning" },
  };

export default function AdminEditionJudgingPage() {
  const params = useParams<{ hackathonId: string }>();
  const hackathonId = params?.hackathonId ?? "";
  const section = useSection();

  const overview = trpc.judging.admin.overview.useQuery(
    { hackathonId },
    { enabled: !!hackathonId, refetchInterval: OFFICER_POLL_MS },
  );

  // Switching from far down a long section leaves the new one scrolled out of
  // sight on a phone; bring its top back into view.
  const contentRef = useRef<HTMLDivElement>(null);
  const shown = useRef(section);
  useEffect(() => {
    if (shown.current === section) return;
    shown.current = section;
    const top = contentRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) contentRef.current?.scrollIntoView({ block: "start" });
  }, [section]);

  const data = overview.data;

  return (
    <div className={adminPage}>
      <Link
        href="/admin/judging"
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← All editions
      </Link>
      <header className="mt-4 mb-8">
        {data && <p className={`${kicker} mb-2`}>{data.hackathon.name}</p>}
        <h1 className={adminTitle}>
          Judging
        </h1>
        {data ? (
          <p
            className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 ${meta}`}
          >
            <span className={status(STATE[data.config.state].tone)}>
              Judging {STATE[data.config.state].label.toLowerCase()}
            </span>
            <span>
              {plural(
                data.counts.entries.devpost + data.counts.entries.portal,
                "project",
              )}
            </span>
            <span>
              {stationCount(data.counts.rooms.active, data.counts.rooms.tables)}
            </span>
            <span>{plural(data.counts.judgesSeated, "judge")} seated</span>
            {data.counts.checkInFlags.open > 0 && (
              <span className={status("warning")}>
                {plural(data.counts.checkInFlags.open, "open check-in flag")}
              </span>
            )}
            {data.config.emergencyMode && (
              <span className={status("danger")}>Emergency mode on</span>
            )}
          </p>
        ) : null}
      </header>

      {overview.isLoading ? (
        <p className={body}>Loading the edition…</p>
      ) : overview.isError || !data ? (
        <div className="space-y-4">
          <p className={body}>
            {trpcErrorMessage(overview.error, "Could not load this edition.")}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => overview.refetch()}
              className={btnSecondary}
            >
              Try again
            </button>
            <Link href="/admin/judging" className={btnSecondary}>
              Pick another edition
            </Link>
          </div>
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="Judging console">
            <div className={`lg:hidden mb-8 ${tabList}`}>
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  aria-current={section === s.id ? "page" : undefined}
                  className={tab(section === s.id)}
                  onPointerEnter={() => preloadSection(s.id)}
                  onFocus={() => preloadSection(s.id)}
                >
                  {s.label}
                </a>
              ))}
            </div>
            <ul className="hidden lg:block sticky top-6 border-l border-[var(--border-subtle)]">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={section === s.id ? "page" : undefined}
                    onPointerEnter={() => preloadSection(s.id)}
                    onFocus={() => preloadSection(s.id)}
                    className={`-ml-px flex min-h-9 items-center border-l-2 pl-4 text-sm transition-colors ${
                      section === s.id
                        ? "border-accent font-semibold text-[var(--text-primary)]"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div ref={contentRef} className="min-w-0 scroll-mt-6">
            {section === "checklist" && (
              <ChecklistSection hackathonId={hackathonId} overview={data} />
            )}
            {section === "projects" && (
              <ProjectsSection hackathonId={hackathonId} overview={data} />
            )}
            {section === "challenges" && (
              <ChallengesSection hackathonId={hackathonId} overview={data} />
            )}
            {section === "rooms" && (
              <RoomsSection hackathonId={hackathonId} overview={data} />
            )}
            {section === "rubric" && <RubricSection hackathonId={hackathonId} />}
            {section === "launch" && (
              <LaunchSection hackathonId={hackathonId} overview={data} />
            )}
            {section === "schedule" && (
              <JudgingSchedule hackathonId={hackathonId} />
            )}
            {section === "claims" && <JudgingClaims hackathonId={hackathonId} />}
            {section === "results" && (
              <JudgingResults hackathonId={hackathonId} />
            )}
            {section === "repo-check" && (
              <RepoCheckSection hackathonId={hackathonId} />
            )}
            {section === "announcements" && (
              <AnnouncementsSection hackathonId={hackathonId} />
            )}
            {section === "danger" && (
              <DangerZone hackathonId={hackathonId} overview={data} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
