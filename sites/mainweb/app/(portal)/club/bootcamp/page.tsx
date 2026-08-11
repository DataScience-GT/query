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
import type { RouterOutputs } from "@query/api";

type Session = RouterOutputs["bootcamp"]["myProgress"]["sessions"][number];

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

/** Written out, not a coloured dot — colour alone is unreadable to some. */
function StatusBadge({ session }: { session: Session | undefined }) {
  const [label, tone] = !session
    ? ["Not scheduled", "text-[var(--text-subtle)] border-[var(--border-subtle)]"]
    : session.attended
      ? ["Attended", "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"]
      : session.past
        ? ["Missed", "text-red-300 border-red-500/40 bg-red-500/10"]
        : ["Upcoming", "text-accent border-accent/40 bg-accent/10"];

  return (
    <span
      className={`shrink-0 border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${tone}`}
    >
      {label}
    </span>
  );
}

/** Room and time, plus the workspace the material actually lives in. */
function MeetingCard({ nextSession }: { nextSession: Session | undefined }) {
  const room = nextSession?.location ?? BOOTCAMP_ROOM;

  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2">
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
          Where it meets
        </p>
        <p className="mt-3 flex items-center gap-2 text-xl font-black tracking-tight text-[var(--text-primary)]">
          <MapPin className="h-5 w-5 shrink-0 text-accent" />
          {room ?? "To be announced"}
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Clock className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
          {BOOTCAMP_MEETING_TIME ?? "Time to be announced"}
        </p>
      </div>

      <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 p-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
          Next session
        </p>
        {nextSession ? (
          <>
            <p className="mt-3 flex items-center gap-2 text-xl font-black tracking-tight text-[var(--text-primary)]">
              <CalendarDays className="h-5 w-5 shrink-0 text-accent" />
              Week {nextSession.week}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {nextSession.title} · {dateLabel(nextSession.eventDate)}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Nothing on the calendar right now. Sessions appear here as soon as
            they are scheduled.
          </p>
        )}
      </div>
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
        term{isMember ? "" : " — $10 on top of the $25 membership"}.
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

  const now = new Date();
  const nextSession = sessions
    .filter((row) => new Date(row.eventDate) > now)
    .sort(
      (a, b) =>
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
    )[0];

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

            {data?.enrolled && (
              <div className="border border-[var(--border-subtle)] px-5 py-3 text-right">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
                  Attendance
                </p>
                <p className="text-2xl font-black text-[var(--text-primary)]">
                  {data.attended}
                  <span className="text-[var(--text-subtle)]">
                    /{data.held}
                  </span>
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

        {data && !data.enrolled ? (
          <NotEnrolled term={data.term} />
        ) : (
          <MeetingCard nextSession={nextSession} />
        )}

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
                <div className="flex flex-wrap items-start justify-between gap-4">
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

                  {data?.enrolled && <StatusBadge session={entry.session} />}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
