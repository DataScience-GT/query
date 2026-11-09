"use client";

import { use, useState } from "react";
import Link from "next/link";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  ApplicationChip,
  InitiativeChip,
  initiativeState,
  seatLabel,
} from "@/components/portal/initiatives/chips";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  label,
  meta,
  page,
  pageDek,
  pageTitle,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@query/api";
import type { ApplicationStatus } from "@query/db";

type Applicant = RouterOutputs["initiative"]["getById"]["applicants"][number];

const errorText = "text-sm text-[var(--danger)]";
const quietAction =
  "text-sm font-semibold text-[var(--text-subtle)] transition-colors hover:text-[var(--danger)] disabled:opacity-50";
const backLink =
  "text-[13px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)]";
const factRow =
  "grid grid-cols-1 gap-1 border-b border-[var(--border-subtle)] py-3.5 sm:grid-cols-[200px_1fr] sm:gap-6";
const factValue = "text-[15px] font-semibold text-[var(--text-primary)]";

function ApplicantRow({
  initiativeId,
  applicant,
  full,
}: {
  initiativeId: string;
  applicant: Applicant;
  full: boolean;
}) {
  const utils = trpc.useUtils();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [wantResume, setWantResume] = useState(false);

  // Fetched on click, not with the queue: thirty applicants would otherwise
  // mean thirty PDFs on page load.
  const resume = trpc.initiative.applicantResume.useQuery(
    { initiativeId, userId: applicant.userId },
    { enabled: wantResume },
  );

  const decide = trpc.initiative.decide.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.initiative.getById.invalidate({ id: initiativeId }),
        // The list row carries the pending count, so leaving it alone keeps
        // offering a queue that is already empty.
        utils.initiative.listMine.invalidate(),
      ]);
    },
  });

  const send = (decision: "accepted" | "rejected") =>
    decide.mutate({ initiativeId, userId: applicant.userId, decision });

  return (
    <li className="border-b border-[var(--border-subtle)] py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">
              {applicant.name ?? applicant.email}
            </p>
            <ApplicationChip status={applicant.status} side="leader" />
          </div>
          <p className={`${meta} mt-0.5`}>
            <a
              href={`mailto:${applicant.email}`}
              className="transition-colors hover:text-[var(--text-primary)]"
            >
              {applicant.email}
            </a>
          </p>
          {applicant.pitch && (
            <p
              className={`${body} mt-3 max-w-2xl whitespace-pre-line border-l-2 border-[var(--border-medium)] pl-3`}
            >
              {applicant.pitch}
            </p>
          )}

          {applicant.resumeFileName &&
            (resume.data ? (
              <a
                href={resume.data.dataUrl}
                download={resume.data.fileName}
                className={`${textLink} mt-3`}
              >
                Download {resume.data.fileName}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setWantResume(true)}
                disabled={resume.isFetching}
                className={`${textLink} mt-3 disabled:opacity-50`}
              >
                {resume.isFetching
                  ? "Loading resume…"
                  : `Resume: ${applicant.resumeFileName}`}
              </button>
            ))}
          {resume.error && (
            <p aria-live="polite" className={`${errorText} mt-2`}>
              {resume.error.message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {applicant.status === "pending" && (
            <>
              <button
                type="button"
                disabled={decide.isPending || full}
                onClick={() => send("accepted")}
                className={btnPrimary}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => send("rejected")}
                className={btnDanger}
              >
                Reject
              </button>
            </>
          )}

          {applicant.status === "rejected" && (
            <button
              type="button"
              disabled={decide.isPending || full}
              onClick={() => send("accepted")}
              className={btnSecondary}
            >
              Accept after all
            </button>
          )}

          {applicant.status === "accepted" &&
            (confirmRemove ? (
              <>
                <span className="text-sm text-[var(--text-muted)]">
                  Take them off the team?
                </span>
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => {
                    send("rejected");
                    setConfirmRemove(false);
                  }}
                  className={btnDanger}
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className={btnSecondary}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className={quietAction}
              >
                Remove
              </button>
            ))}
        </div>
      </div>

      {decide.error && (
        <p className={`${errorText} mt-3`}>{decide.error.message}</p>
      )}
    </li>
  );
}

function Group({
  title,
  rows,
  render,
}: {
  title: string;
  rows: Applicant[];
  render: (applicant: Applicant) => React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className={sectionTitle}>{title}</h2>
        <span className={`${meta} tabular-nums`}>{rows.length}</span>
      </div>
      <ul className="mt-4 border-t border-[var(--border-subtle)]">
        {rows.map(render)}
      </ul>
    </section>
  );
}

export default function LeadInitiativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const detail = trpc.initiative.getById.useQuery({ id });

  if (detail.isPending) return <LoadingScreen />;

  if (detail.error) {
    return (
      <div className={page}>
        <Link href="/lead" className={backLink}>
          ← Your projects
        </Link>
        <h1 className={`${pageTitle} mt-6`}>This project did not load</h1>
        <p className={pageDek}>
          {detail.error.message} Go back to your projects and open it again.
        </p>
        <Link href="/lead" className={`${textLink} mt-6`}>
          Back to your projects
        </Link>
      </div>
    );
  }

  const { initiative, applicants, accepted } = detail.data;
  const state = initiativeState(initiative);
  const full =
    initiative.maxMembers !== null && accepted >= initiative.maxMembers;

  const inState = (...wanted: ApplicationStatus[]) =>
    applicants.filter((row) => wanted.includes(row.status));

  const row = (applicant: Applicant) => (
    <ApplicantRow
      key={applicant.userId}
      initiativeId={initiative.id}
      applicant={applicant}
      full={full}
    />
  );

  return (
    <div className={page}>
      <Link href="/lead" className={backLink}>
        ← Your projects
      </Link>

      <header className="mt-6">
        <h1 className={pageTitle}>{initiative.title}</h1>

        {/* Said once, at the top: every Accept below is off and the reason has to
            be readable without hovering a disabled button. */}
        {full && (
          <p className={pageDek}>
            Every spot is taken. Raise the team size, or remove somebody, before
            accepting anyone else.
          </p>
        )}

        {state === "draft" && (
          <p className={pageDek}>
            This is still a draft, so members cannot see it or apply. Open it
            from your projects list.
          </p>
        )}
      </header>

      <dl className="mt-8 max-w-3xl border-t border-[var(--border-subtle)]">
        <div className={factRow}>
          <dt className={label}>Status</dt>
          <dd>
            <InitiativeChip state={state} />
          </dd>
        </div>
        <div className={factRow}>
          <dt className={label}>Team</dt>
          <dd className={factValue}>
            {seatLabel(accepted, initiative.maxMembers)}
          </dd>
        </div>
        {initiative.commitment && (
          <div className={factRow}>
            <dt className={label}>Commitment</dt>
            <dd className={factValue}>{initiative.commitment}</dd>
          </div>
        )}
      </dl>

      {applicants.length === 0 ? (
        <section className="mt-12">
          <h2 className={sectionTitle}>Applications</h2>
          <p className={`${body} mt-3 max-w-xl`}>
            Nobody has applied yet.{" "}
            {state === "open"
              ? "It is open, so it is showing on the members' projects page."
              : "Open it from your projects list and it will start showing to members."}
          </p>
          {state !== "open" && (
            <Link href="/lead" className={`${textLink} mt-4`}>
              Go to your projects
            </Link>
          )}
        </section>
      ) : (
        <>
          <Group
            title="Waiting on you"
            rows={inState("pending")}
            render={row}
          />
          <Group title="On the team" rows={inState("accepted")} render={row} />
          <Group
            title="Turned down and withdrawn"
            rows={inState("rejected", "withdrawn")}
            render={row}
          />
        </>
      )}
    </div>
  );
}
