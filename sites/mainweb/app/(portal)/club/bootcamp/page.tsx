"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  GraduationCap,
  MapPin,
  Clock,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { BootcampAddOn } from "@/components/portal/BootcampAddOn";
import { trpc } from "@/lib/trpc";
import {
  BOOTCAMP_CURRICULUM,
  BOOTCAMP_MEETING_TIME,
  BOOTCAMP_ROOM,
  BOOTCAMP_WORKSPACE_URL,
} from "@/lib/bootcamp-schedule";
import {
  MEMBERSHIP_CENTS,
  SEMESTER_MEMBERSHIP_CENTS,
  BOOTCAMP_ADDON_CENTS,
  formatCents,
} from "@query/api/pricing";

/** `2026-fall` is how it is stored; nobody should have to read it that way. */
function termLabel(term: string) {
  const [year, season] = term.split("-");
  if (!year || !season) return term;
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

const dateLabel = (date: Date) =>
  new Date(date).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * What an enrolled member sees for now.
 *
 * Room, meeting time and workspace URL are all still unset, so the real page
 * would be a grid of "to be announced" — this says the same thing once, and
 * honestly. It goes away when the schedule lands.
 */
function WorkInProgress({ term }: { term: string }) {
  return (
    <div className="border border-accent/30 bg-accent/[0.06] p-8">
      <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
        Work in progress
      </p>
      <h2 className="mt-3 text-2xl font-black uppercase italic tracking-tight text-[var(--text-primary)]">
        You are in the {term} bootcamp
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
        Your spot is confirmed — nothing else to do. We are still putting the
        schedule, the room and the notebooks together, so this page is not
        finished yet. Session times, attendance and the workspace link all show
        up here once they are set, and you will hear from us before the first
        meeting.
      </p>
      <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <MapPin className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
        {BOOTCAMP_ROOM ?? "Room to be announced"}
        <Clock className="ml-3 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
        {BOOTCAMP_MEETING_TIME ?? "Time to be announced"}
      </p>
    </div>
  );
}

/** Hidden until the URL is set — a button that goes nowhere is worse. */
function WorkspaceLink() {
  if (!BOOTCAMP_WORKSPACE_URL) return null;

  return (
    <a
      href={BOOTCAMP_WORKSPACE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-bold text-accent transition-ui hover:bg-accent/20"
    >
      <ExternalLink className="h-4 w-4" />
      Open bootcamp workspace
    </a>
  );
}

/** Members buy the add-on here; non-members go to the flow that sells both. */
function NotEnrolled({ term }: { term: string }) {
  const memberStatus = trpc.member.checkStatus.useQuery();
  const isMember = !!memberStatus.data?.isActive;

  return (
    <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-8">
      <h2 className="text-xl font-black uppercase italic tracking-tight text-[var(--text-primary)]">
        You are not in the {termLabel(term)} bootcamp
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">
        Twelve weeks of Python and data science, taught in person, with the
        notebooks to keep. It runs for one semester, so joining covers this
        term
        {isMember
          ? ""
          : ` — ${formatCents(BOOTCAMP_ADDON_CENTS)} on top of a membership (${formatCents(MEMBERSHIP_CENTS)} a year or ${formatCents(SEMESTER_MEMBERSHIP_CENTS)} a semester)`}
        .
      </p>

      {isMember ? (
        <BootcampAddOn term={termLabel(term)} />
      ) : (
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 bg-accent px-6 py-3 text-sm font-black uppercase tracking-widest text-black transition-ui hover:bg-accent/90"
        >
          Become a member
        </Link>
      )}
    </div>
  );
}

export default function BootcampPortalPage() {
  const { data: session, status } = useSession();
  const progress = trpc.bootcamp.myProgress.useQuery(undefined, {
    enabled: !!session,
  });

  if (status === "loading" || progress.isPending) {
    return <LoadingScreen message="Loading bootcamp…" />;
  }

  const data = progress.data;
  const enrolled = !!data?.enrolled;
  const sessions = data?.sessions ?? [];
  const byWeek = new Map(sessions.map((row) => [row.week, row]));

  // Curriculum is the spine, so an unscheduled week still shows.
  const extras = sessions.filter(
    (row) => !BOOTCAMP_CURRICULUM.some((entry) => entry.week === row.week),
  );
  const weeks = [
    ...BOOTCAMP_CURRICULUM.map((entry) => ({
      week: entry.week,
      title: entry.title,
      desc: entry.desc,
      deepnoteUrl: entry.deepnoteUrl,
      session: byWeek.get(entry.week),
    })),
    ...extras.map((row) => ({
      week: row.week ?? 0,
      title: row.title,
      desc: row.description ?? "",
      deepnoteUrl: undefined,
      session: row,
    })),
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-20 text-[var(--text-muted)]">
      <main className="mx-auto max-w-5xl px-6 pt-12 md:pt-20">
        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <GraduationCap className="h-6 w-6 text-accent" />
                <h1 className="text-3xl font-black uppercase italic tracking-tight text-[var(--text-primary)] md:text-4xl">
                  Bootcamp
                </h1>
              </div>
              <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[var(--text-subtle)]">
                {data ? termLabel(data.term) : ""} · Data Science at Georgia Tech
              </p>
            </div>

            {enrolled && (
              <div className="border border-accent/30 bg-accent/[0.06] px-5 py-3 text-right">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
                  Status
                </p>
                <p className="text-lg font-black uppercase text-accent">
                  Enrolled
                </p>
              </div>
            )}
          </div>
        </header>

        {progress.error && (
          <p role="alert" className="mb-6 text-sm text-red-300">
            {progress.error.message}
          </p>
        )}

        {enrolled && data ? (
          <WorkInProgress term={termLabel(data.term)} />
        ) : (
          <>
            {data && <NotEnrolled term={data.term} />}

            <div className="my-8">
              <WorkspaceLink />
            </div>

            <section>
              <h2 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">
                The twelve weeks
              </h2>

              <ol className="space-y-3">
                {weeks.map((entry) => (
                  <li
                    key={entry.week}
                    className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-5 transition-ui hover:border-white/20"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
                        Week {String(entry.week).padStart(2, "0")}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                        {entry.title}
                      </h3>
                      {entry.desc && (
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {entry.desc}
                        </p>
                      )}

                      {entry.session && (
                        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-subtle)]">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {dateLabel(entry.session.eventDate)}
                          </span>
                          {entry.session.location && (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5" />
                              {entry.session.location}
                            </span>
                          )}
                        </p>
                      )}

                      {entry.deepnoteUrl && (
                        <a
                          href={entry.deepnoteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Notebook
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
