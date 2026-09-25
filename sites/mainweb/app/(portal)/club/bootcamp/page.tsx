"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { BootcampMaterialsTable } from "@/components/portal/BootcampMaterialsTable";
import { trpc } from "@/lib/trpc";
import { loginHref } from "@/lib/safe-callback";
import {
  BOOTCAMP_MEETING_TIME,
  BOOTCAMP_ROOM,
  BOOTCAMP_START_DATE,
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

/** Where and when it meets — the thing somebody checks walking to class. */
function MeetingCard() {
  return (
    <div className="border border-accent/30 bg-accent/[0.06] p-6">
      <p className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-[var(--text-primary)]">
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-accent" />
          {BOOTCAMP_ROOM ?? "Room to be announced"}
        </span>
        <span className="inline-flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-accent" />
          {BOOTCAMP_MEETING_TIME ?? "Time to be announced"}
        </span>
        {BOOTCAMP_START_DATE && (
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-accent" />
            First session {BOOTCAMP_START_DATE}
          </span>
        )}
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
        Nine weeks of Python and data science, taught in person, with the
        notebooks to keep. It runs for one semester, so joining covers this term
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
  const router = useRouter();
  // Queries wait on the session, so a signed-out visitor otherwise sits on
  // the loading screen forever.
  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);
  const progress = trpc.bootcamp.myProgress.useQuery(undefined, {
    enabled: !!session,
  });
  const workshops = trpc.bootcamp.workshops.useQuery(undefined, {
    enabled: !!session,
  });

  if (status === "loading" || progress.isPending || workshops.isPending) {
    return <LoadingScreen message="Loading bootcamp…" />;
  }

  const data = progress.data;
  const enrolled = !!data?.enrolled;

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
                {data ? termLabel(data.term) : ""} · Data Science at Georgia
                Tech
              </p>
            </div>

            {enrolled && data && (
              <div className="border border-accent/30 bg-accent/[0.06] px-5 py-3 text-right">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
                  Status
                </p>
                <p className="text-lg font-black uppercase text-accent">
                  Enrolled
                </p>
                {/* 0 of 0 reads as a failure. */}
                {data.held > 0 && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]">
                    {data.attended}/{data.held} attended
                  </p>
                )}
              </div>
            )}
          </div>
        </header>

        {progress.error && (
          <p role="alert" className="mb-6 text-sm text-red-300">
            {progress.error.message}
          </p>
        )}

        {workshops.error && (
          <p role="alert" className="mb-6 text-sm text-red-300">
            {workshops.error.message}
          </p>
        )}

        {enrolled && data && (
          <div className="mb-6">
            <h2 className="text-2xl font-black uppercase italic tracking-tight text-[var(--text-primary)]">
              Welcome to the {termLabel(data.term)} Bootcamp
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
              Here you&apos;ll find all the materials you need for bootcamp,
              including the meeting dates, notebooks, datasets, solutions, and
              recordings. We&apos;ll post solutions and recordings after every
              in-person workshop.
            </p>
          </div>
        )}

        {/* Enrolled members came for the room and time; everyone else needs the offer. */}
        {enrolled ? <MeetingCard /> : data && <NotEnrolled term={data.term} />}

        {/* Scoped to the member's own cohort by the server, so a past cohort's
            files stay here after the term rolls even though the upsell shows. */}
        {(enrolled || (workshops.data?.length ?? 0) > 0) && (
          <section className="mt-8">
            <h2 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">
              Weekly materials
            </h2>
            <BootcampMaterialsTable
              rows={workshops.data ?? []}
              term={data ? termLabel(workshops.data?.[0]?.term ?? data.term) : ""}
            />
          </section>
        )}

        <div className="my-8">
          <WorkspaceLink />
        </div>
      </main>
    </div>
  );
}
