"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ExternalLink } from "lucide-react";
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
import {
  body,
  btnPrimary,
  btnSecondary,
  kicker,
  label,
  meta,
  page,
  pageDek,
  pageTitle,
  sectionRule,
  sectionTitle,
  status,
} from "@/components/portal/ui";

/** `2026-fall` is how it is stored; nobody should have to read it that way. */
function termLabel(term: string) {
  const [year, season] = term.split("-");
  if (!year || !season) return term;
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

/** Where and when it meets — the thing somebody checks walking to class. */
function MeetingCard() {
  const rows = [
    { label: "Room", value: BOOTCAMP_ROOM },
    { label: "Time", value: BOOTCAMP_MEETING_TIME },
    { label: "First session", value: BOOTCAMP_START_DATE },
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className={label}>{row.label}</dt>
          <dd className="mt-1 text-[17px] font-semibold text-[var(--text-primary)]">
            {row.value ?? "To be announced"}
          </dd>
        </div>
      ))}
    </dl>
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
      className={btnSecondary}
    >
      Open bootcamp workspace
      <ExternalLink aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
    </a>
  );
}

/** Members buy the add-on here; non-members go to the flow that sells both. */
function NotEnrolled({ term }: { term: string }) {
  const memberStatus = trpc.member.checkStatus.useQuery();
  const isMember = !!memberStatus.data?.isActive;

  return (
    <div>
      <h2 className={sectionTitle}>
        You are not in the {termLabel(term)} bootcamp
      </h2>
      <p className={`${body} mt-3 max-w-2xl`}>
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
        <Link href="/dashboard" className={`${btnPrimary} mt-6`}>
          Become a member
        </Link>
      )}
    </div>
  );
}

export default function BootcampPortalPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  // Queries wait on the session, so a signed-out visitor otherwise sits on
  // the loading screen forever.
  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.push(loginHref());
  }, [sessionStatus, router]);
  const progress = trpc.bootcamp.myProgress.useQuery(undefined, {
    enabled: !!session,
  });
  const workshops = trpc.bootcamp.workshops.useQuery(undefined, {
    enabled: !!session,
  });

  if (
    sessionStatus === "loading" ||
    progress.isPending ||
    workshops.isPending
  ) {
    return <LoadingScreen message="Loading bootcamp…" />;
  }

  const data = progress.data;
  const enrolled = !!data?.enrolled;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)]">
      <main className={page}>
        <header>
          <p className={kicker}>
            {data ? `${termLabel(data.term)} · ` : ""}Data Science at Georgia
            Tech
          </p>
          <h1 className={`${pageTitle} mt-2`}>Bootcamp</h1>

          {enrolled && data && (
            <>
              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className={status("success")}>Enrolled</span>
                {/* 0 of 0 reads as a failure. */}
                {data.held > 0 && (
                  <span className={meta}>
                    {data.attended} of {data.held} attended
                  </span>
                )}
              </p>
              <p className={pageDek}>
                Meeting details, notebooks, datasets, solutions and recordings
                for the {termLabel(data.term)} cohort. Solutions and recordings
                go up after each in-person workshop.
              </p>
            </>
          )}
        </header>

        {progress.error && (
          <p role="alert" className="mt-6 text-sm text-[var(--danger)]">
            {progress.error.message}
          </p>
        )}

        {workshops.error && (
          <p role="alert" className="mt-6 text-sm text-[var(--danger)]">
            {workshops.error.message}
          </p>
        )}

        {/* Enrolled members came for the room and time; everyone else needs the offer. */}
        {(enrolled || data) && (
          <section className={`${sectionRule} mt-10`}>
            {enrolled ? <MeetingCard /> : data && <NotEnrolled term={data.term} />}
          </section>
        )}

        {/* Scoped to the member's own cohort by the server, so a past cohort's
            files stay here after the term rolls even though the upsell shows. */}
        {(enrolled || (workshops.data?.length ?? 0) > 0) && (
          <section className="mt-12">
            <h2 className={sectionTitle}>Weekly materials</h2>
            <div className="mt-4">
              <BootcampMaterialsTable
                rows={workshops.data ?? []}
                term={
                  data ? termLabel(workshops.data?.[0]?.term ?? data.term) : ""
                }
              />
            </div>
          </section>
        )}

        <div className="mt-10">
          <WorkspaceLink />
        </div>
      </main>
    </div>
  );
}
