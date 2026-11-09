"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  SubteamApplicationChip,
  shortDate,
} from "@/components/portal/subteams/chips";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  meta,
  object,
  page,
  pageDek,
  pageTitle,
  sectionTitle,
} from "@/components/portal/ui";
import { trpc } from "@/lib/trpc";
import { loginHref } from "@/lib/safe-callback";
import type { RouterOutputs } from "@query/api";

type OpenSubteam = RouterOutputs["subteam"]["list"][number];
type MyApplication = RouterOutputs["subteam"]["myApplications"][number];

const errorText = "text-sm text-[var(--danger)]";
const quietAction =
  "text-sm font-semibold text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50";
const inlineLink =
  "font-semibold text-[var(--text-primary)] underline decoration-accent underline-offset-4 hover:decoration-[var(--text-primary)]";
const listRow = "border-b border-[var(--border-subtle)] py-5";
const quote = `${body} whitespace-pre-line border-l-2 border-[var(--border-medium)] pl-3`;

// Mirrors the router's limits, so the browser stops the typing rather than the
// server bouncing the whole form.
const MAX_ANSWER = 2000;
const MAX_NOTE = 1000;

function ApplyForm({
  subteam,
  onDone,
}: {
  subteam: OpenSubteam;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const join = trpc.subteam.requestToJoin.useMutation({
    onSuccess: async () => {
      onDone();
      // Applying moves a subteam from one list to the other; refreshing one
      // alone renders it twice.
      await Promise.all([
        utils.subteam.list.invalidate(),
        utils.subteam.myApplications.invalidate(),
      ]);
    },
  });

  const missing = subteam.questions.some(
    (question) => question.required && !answers[question.id]?.trim(),
  );

  return (
    <form
      className="mt-5 space-y-5 border-t border-[var(--border-subtle)] pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        join.mutate({
          subteamId: subteam.id,
          answers: subteam.questions.map((question) => ({
            questionId: question.id,
            answer: (answers[question.id] ?? "").trim(),
          })),
          note: note.trim() || undefined,
        });
      }}
    >
      {subteam.questions.map((question) => {
        const id = `answer-${subteam.id}-${question.id}`;
        return (
          <div key={question.id}>
            <label htmlFor={id} className={fieldLabel}>
              {question.prompt}
              {!question.required && (
                <span className="font-normal text-[var(--text-subtle)]">
                  {" "}
                  (optional)
                </span>
              )}
            </label>
            <textarea
              id={id}
              rows={3}
              required={question.required}
              maxLength={MAX_ANSWER}
              value={answers[question.id] ?? ""}
              onChange={(event) =>
                setAnswers((prev) => ({
                  ...prev,
                  [question.id]: event.target.value,
                }))
              }
              className={input}
            />
          </div>
        );
      })}

      <div>
        <label htmlFor={`note-${subteam.id}`} className={fieldLabel}>
          Anything else we should know?{" "}
          <span className="font-normal text-[var(--text-subtle)]">
            (optional)
          </span>
        </label>
        <textarea
          id={`note-${subteam.id}`}
          rows={2}
          maxLength={MAX_NOTE}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={input}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={join.isPending || missing}
          className={btnPrimary}
        >
          {join.isPending ? "Sending…" : "Send application"}
        </button>
        <button
          type="button"
          onClick={() => {
            join.reset();
            onDone();
          }}
          className={btnSecondary}
        >
          Cancel
        </button>
      </div>

      {join.error && (
        <p aria-live="polite" className={errorText}>
          {join.error.message}
        </p>
      )}
    </form>
  );
}

function SubteamCard({
  subteam,
  canApply,
}: {
  subteam: OpenSubteam;
  canApply: boolean;
}) {
  const [writing, setWriting] = useState(false);

  return (
    <li className={`${object} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={itemTitle}>{subteam.name}</h3>
          {subteam.summary && (
            <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-secondary)]">
              {subteam.summary}
            </p>
          )}
        </div>

        {subteam.myStatus ? (
          <SubteamApplicationChip status={subteam.myStatus} />
        ) : (
          !writing &&
          canApply && (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className={`${btnSecondary} shrink-0`}
            >
              Apply
            </button>
          )
        )}
      </div>

      {subteam.description && (
        <div className="mt-4">
          <p className={meta}>What you would do</p>
          <p className={`${body} mt-1 whitespace-pre-line`}>
            {subteam.description}
          </p>
        </div>
      )}

      {writing && (
        <ApplyForm subteam={subteam} onDone={() => setWriting(false)} />
      )}
    </li>
  );
}

function ApplicationRow({ application }: { application: MyApplication }) {
  const utils = trpc.useUtils();
  const [confirm, setConfirm] = useState(false);

  const withdraw = trpc.subteam.withdraw.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.subteam.list.invalidate(),
        utils.subteam.myApplications.invalidate(),
      ]);
    },
  });

  return (
    <li className={listRow}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {application.subteamName}
            </h3>
            <SubteamApplicationChip status={application.status} />
          </div>
          <p className={`${meta} mt-1`}>
            Applied {shortDate(application.appliedAt)}
            {application.subteamArchivedAt !== null ? " · archived" : ""}
          </p>
          {application.decisionNote && (
            <p className={`${quote} mt-3`}>{application.decisionNote}</p>
          )}
          {application.answers.length > 0 && (
            <details className="mt-3">
              <summary className={`${quietAction} cursor-pointer`}>
                Your answers
              </summary>
              <dl className="mt-3 space-y-3">
                {application.answers.map((row) => (
                  <div key={row.questionId}>
                    <dt className={meta}>{row.prompt}</dt>
                    <dd className={`${body} mt-0.5 whitespace-pre-line`}>
                      {row.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>

        {/* Only while nobody has decided: after that it is the admins' record. */}
        {application.status === "pending" &&
          (confirm ? (
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-[var(--text-muted)]">
                Withdraw your application?
              </span>
              <button
                type="button"
                disabled={withdraw.isPending}
                onClick={() => {
                  withdraw.mutate({ applicationId: application.id });
                  setConfirm(false);
                }}
                className={btnDanger}
              >
                Withdraw
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className={`${quietAction} shrink-0`}
            >
              Withdraw
            </button>
          ))}
      </div>

      {withdraw.error && (
        <p className={`${errorText} mt-3`}>{withdraw.error.message}</p>
      )}
    </li>
  );
}

export default function SubteamsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  // Queries wait on the session, so a signed-out visitor otherwise sits on
  // the loading screen forever.
  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);

  const open = trpc.subteam.list.useQuery(undefined, { enabled: !!session });
  const mine = trpc.subteam.myApplications.useQuery(undefined, {
    enabled: !!session,
  });
  const memberStatus = trpc.member.checkStatus.useQuery(undefined, {
    enabled: !!session,
  });

  if (status === "loading" || open.isPending || mine.isPending) {
    return <LoadingScreen />;
  }

  const subteams = open.data ?? [];
  const applications = mine.data ?? [];
  const canApply = !!memberStatus.data?.isActive;
  const loadError = open.error ?? mine.error;

  return (
    <div className={page}>
      <Link
        href="/dashboard"
        className="text-[13px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)]"
      >
        ← Dashboard
      </Link>

      <header className="mt-6">
        <h1 className={pageTitle}>Subteams</h1>
        <p className={pageDek}>
          The groups that run the club. Pick one you want to help with and tell
          us a little about yourself.
        </p>
      </header>

      {loadError && (
        <p className={`${errorText} mt-6`}>
          {loadError.message} Refresh the page to try again.
        </p>
      )}

      {!canApply && memberStatus.isSuccess && (
        <p className={`${meta} mt-6`}>
          Applying needs an active membership.{" "}
          <Link href="/dashboard" className={inlineLink}>
            Become a member
          </Link>
        </p>
      )}

      <section className="mt-10">
        <h2 className={sectionTitle}>Taking applications</h2>
        {subteams.length > 0 ? (
          <ul className="mt-5 space-y-4">
            {subteams.map((subteam) => (
              <SubteamCard
                key={subteam.id}
                subteam={subteam}
                canApply={canApply}
              />
            ))}
          </ul>
        ) : (
          <p className={`${body} mt-3 max-w-xl`}>
            No subteams are taking applications right now. Check back at the
            start of the semester, when most of them open.
          </p>
        )}
      </section>

      {applications.length > 0 && (
        <section className="mt-12">
          <h2 className={sectionTitle}>Your applications</h2>
          <ul className="mt-4 border-t border-[var(--border-subtle)]">
            {applications.map((application) => (
              <ApplicationRow key={application.id} application={application} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
