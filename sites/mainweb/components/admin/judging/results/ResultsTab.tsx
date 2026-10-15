"use client";

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import type { RouterOutputs } from "@query/api";
import {
  body,
  btnDanger,
  btnInk,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  eventClock,
  eventMoment,
} from "@/components/hackathon/judging/event-time";
import { plural, useRefreshJudging } from "@/components/admin/judging/shared";
import {
  describeJudge,
  judgeNumbers,
} from "@/components/admin/judging/results/calibration";
import type { CalibrationChallenge } from "@/components/admin/judging/results/calibration";

// Officer screens poll every 10 seconds while judges are still submitting.
const POLL_MS = 10_000;
// A line above the lists that asks the organiser to look before they publish.
const WARNING_BANNER =
  "border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]";
// Rows shown per placing list before "Show all".
const PLACINGS_SHOWN = 10;
const AUDIT_PAGE = 50;

type AuditRow = RouterOutputs["judging"]["results"]["evaluationAudit"][number];

const score = (value: number | null) =>
  value === null ? "No score" : value.toFixed(2);

/**
 * Ranking and releasing results: compute draft placings from complete
 * evaluations, check them, publish them to the hackathon's Results tab, and
 * look behind any number at who scored what.
 */
export function ResultsTab({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const refreshJudging = useRefreshJudging();
  const auditRef = useRef<HTMLElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [openScopes, setOpenScopes] = useState<Set<string>>(new Set());
  const [openCalibration, setOpenCalibration] = useState<Set<string>>(
    new Set(),
  );
  const [entryFilter, setEntryFilter] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const list = trpc.judging.results.list.useQuery(
    { hackathonId },
    { refetchInterval: POLL_MS },
  );

  const refresh = () => {
    setError(null);
    void utils.judging.results.list.invalidate({ hackathonId });
    // The public tab reads published placings; drop its copy too.
    void utils.hackathon.getResults.invalidate();
  };
  const onError = (e: Parameters<typeof trpcErrorMessage>[0]) =>
    setError(trpcErrorMessage(e, "That did not go through. Try again."));

  const compute = trpc.judging.results.compute.useMutation({
    onSuccess: refresh,
    onError,
  });
  const publish = trpc.judging.results.publish.useMutation({
    onSuccess: refresh,
    onError,
  });
  const unpublish = trpc.judging.results.unpublish.useMutation({
    onSuccess: refresh,
    onError,
  });
  // The decision changes the Projects list and the public tab as well as this
  // one, so refresh all of judging, then the public copy.
  const setEligibility = trpc.judging.admin.setPrizeEligibility.useMutation({
    onSuccess: () => {
      setError(null);
      void refreshJudging();
      void utils.hackathon.getResults.invalidate();
    },
    onError,
  });
  // Once placings are out the edition is over; offer to close it here rather
  // than send organisers back to the hackathon dashboard for one click.
  const edition = trpc.hackathon.getById.useQuery({ id: hackathonId });
  const complete = trpc.hackathon.update.useMutation({
    onSuccess: () => void utils.hackathon.getById.invalidate(),
    onError,
  });
  const busy =
    compute.isPending ||
    publish.isPending ||
    unpublish.isPending ||
    setEligibility.isPending ||
    complete.isPending;

  if (list.isLoading) {
    return <p className={`py-16 ${body}`}>Loading results…</p>;
  }

  if (list.isError || !list.data) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className={body}>
          {trpcErrorMessage(list.error, "Results did not load.")}
        </p>
        <button
          type="button"
          onClick={() => void list.refetch()}
          className={btnSecondary}
        >
          Try again
        </button>
      </div>
    );
  }

  const {
    computedAt,
    publishedAt,
    evaluationsSinceCompute,
    scopes,
    calibration,
  } = list.data;
  const published = !!publishedAt;

  // Teams, not rows: one team can place in several lists. A team already
  // pulled from prizes has been decided, so it is not asked about again.
  const flaggedPlaced = new Set(
    scopes.flatMap((scope) =>
      scope.placements
        .filter((row) => row.openCheckInFlags > 0 && !row.prizeIneligible)
        .map((row) => row.entryId),
    ),
  );

  const showEvaluations = (entry: { id: string; title: string }) => {
    setEntryFilter(entry);
    auditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-10">
      <section className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className={sectionTitle}>Results</h2>
          <p className={`mt-2 ${meta}`}>
            {published && publishedAt ? (
              <span className={status("success")}>
                Published {eventMoment(publishedAt)}
              </span>
            ) : computedAt ? (
              `Draft computed ${eventMoment(computedAt)}. Not public yet.`
            ) : (
              "Not computed yet. Nothing is public until you publish."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              compute.mutate({ hackathonId });
            }}
            disabled={readOnly || published || busy}
            title={
              readOnly
                ? READ_ONLY_TITLE
                : published
                  ? "Unpublish first to compute again."
                  : undefined
            }
            className={btnInk}
          >
            {compute.isPending
              ? "Computing…"
              : computedAt
                ? "Compute again"
                : "Compute results"}
          </button>
          {published ? (
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    "Take the placings off the hackathon's public Results tab?",
                  )
                )
                  return;
                setError(null);
                unpublish.mutate({ hackathonId });
              }}
              disabled={readOnly || busy}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={btnDanger}
            >
              {unpublish.isPending ? "Unpublishing…" : "Unpublish"}
            </button>
          ) : (
            computedAt && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Publish these placings? Everyone can see them on the hackathon's Results tab.",
                    )
                  )
                    return;
                  setError(null);
                  publish.mutate({ hackathonId });
                }}
                disabled={readOnly || busy}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnPrimary}
              >
                {publish.isPending ? "Publishing…" : "Publish"}
              </button>
            )
          )}
          {published &&
            edition.data &&
            edition.data.status !== "completed" && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Mark this edition completed?",
                    )
                  )
                    return;
                  setError(null);
                  complete.mutate({ id: hackathonId, status: "completed" });
                }}
                disabled={readOnly || busy}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnSecondary}
              >
                {complete.isPending ? "Saving…" : "Mark edition completed"}
              </button>
            )}
        </div>
      </section>

      {evaluationsSinceCompute > 0 && (
        <p className={WARNING_BANNER}>
          {evaluationsSinceCompute}{" "}
          {evaluationsSinceCompute === 1
            ? "evaluation was"
            : "evaluations were"}{" "}
          saved after this ranking was computed.{" "}
          {published
            ? "Unpublish, compute again and republish to include them."
            : "Compute again to include them."}
        </p>
      )}

      {flaggedPlaced.size > 0 && (
        <p className={WARNING_BANNER}>
          {plural(flaggedPlaced.size, "placed team")}{" "}
          {flaggedPlaced.size === 1 ? "has" : "have"} open check-in flags.{" "}
          {published
            ? "Review them in Projects. A team pulled from prizes leaves the public list at once."
            : "Review them before you publish."}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <section className={sectionRule}>
        {scopes.length === 0 ? (
          <p className={body}>
            {computedAt
              ? "No project has a complete evaluation yet, so nothing was ranked. Compute again once judges submit."
              : "Compute results once judges have submitted. Each challenge and the overall list rank projects by the mean of their complete evaluations, each adjusted for how strict or generous its judge is; ties share a placing."}
          </p>
        ) : (
          <div className="space-y-10">
            {scopes.map((scope) => {
              const open = openScopes.has(scope.scope);
              const rows = open
                ? scope.placements
                : scope.placements.slice(0, PLACINGS_SHOWN);
              // Rows computed before calibration existed have no raw score,
              // and their score is the plain mean.
              const calibrated = scope.placements.some(
                (row) => row.rawScore !== null,
              );
              return (
                <div key={scope.scope}>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className={itemTitle}>{scope.scopeLabel}</h3>
                    <span className={meta}>
                      {scope.placements.length}{" "}
                      {scope.placements.length === 1 ? "project" : "projects"}
                    </span>
                  </div>
                  {calibrated && (
                    <p className={`mt-1 text-right ${label}`}>
                      Adjusted for judge bias
                    </p>
                  )}
                  <ol className="mt-3 border-t border-[var(--border-subtle)]">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-4 border-b border-[var(--border-subtle)] py-3"
                      >
                        <span className="font-[family-name:var(--font-display)] text-[22px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                          {row.placement}
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              showEvaluations({
                                id: row.entryId,
                                title: row.title,
                              })
                            }
                            title="Show this project's evaluations"
                            className="max-w-full truncate text-left text-[15px] font-semibold text-[var(--text-primary)] hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4"
                          >
                            {row.title}
                          </button>
                          {row.withdrawn && (
                            <p className={status("warning")}>
                              Pulled from judging; hidden from the public list
                            </p>
                          )}
                          {(row.openCheckInFlags > 0 ||
                            row.prizeIneligible) && (
                            <div className="mt-1 flex flex-col items-start gap-1">
                              {row.openCheckInFlags > 0 && (
                                <p className={status("warning")}>
                                  {plural(
                                    row.openCheckInFlags,
                                    "open check-in flag",
                                  )}
                                  :{" "}
                                  <a href="#projects" className={textLink}>
                                    see Projects
                                  </a>
                                </p>
                              )}
                              {row.prizeIneligible && (
                                <p className={status("danger")}>
                                  Not eligible for prizes; recompute to move the
                                  next team up
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    !row.prizeIneligible &&
                                    !window.confirm(
                                      `Pull ${row.title} from prizes? Judges still score it. It leaves the public Results tab at once and the placings when you compute again.`,
                                    )
                                  )
                                    return;
                                  setError(null);
                                  setEligibility.mutate({
                                    hackathonId,
                                    entryId: row.entryId,
                                    eligible: row.prizeIneligible,
                                  });
                                }}
                                disabled={readOnly || busy}
                                title={readOnly ? READ_ONLY_TITLE : undefined}
                                className={
                                  row.prizeIneligible ? btnSecondary : btnDanger
                                }
                              >
                                {setEligibility.isPending &&
                                setEligibility.variables?.entryId ===
                                  row.entryId
                                  ? "Saving…"
                                  : row.prizeIneligible
                                    ? "Make eligible again"
                                    : "Pull from prizes"}
                              </button>
                            </div>
                          )}
                        </div>
                        <span className="text-right text-[13px] tabular-nums text-[var(--text-subtle)]">
                          <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                            {score(row.score)}
                          </span>{" "}
                          {row.rawScore !== null && (
                            <span title="The plain mean, before the adjustment">
                              raw {row.rawScore.toFixed(2)}{" "}
                            </span>
                          )}
                          · {row.evaluationCount}{" "}
                          {row.evaluationCount === 1 ? "eval" : "evals"}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {scope.placements.length > PLACINGS_SHOWN && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenScopes((previous) => {
                          const next = new Set(previous);
                          if (open) next.delete(scope.scope);
                          else next.add(scope.scope);
                          return next;
                        })
                      }
                      className={`mt-3 ${textLink}`}
                    >
                      {open
                        ? "Show the top ten"
                        : `Show all ${scope.placements.length}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {calibration.length > 0 && (
        <section className={sectionRule}>
          <h3 className={itemTitle}>Judge calibration</h3>
          <p className={`mt-1 ${meta}`}>
            Each project is graded once, so a strict or generous judge moves
            every project they graded. Scores above are adjusted for that,
            comparing judges only within their own challenge. Judges and hackers
            see none of this.
          </p>
          <div className="mt-3 border-t border-[var(--border-subtle)]">
            {calibration.map((challenge) => (
              <CalibrationChallengeRow
                key={challenge.challengeId}
                challenge={challenge}
                open={openCalibration.has(challenge.challengeId)}
                onToggle={() =>
                  setOpenCalibration((previous) => {
                    const next = new Set(previous);
                    if (next.has(challenge.challengeId)) {
                      next.delete(challenge.challengeId);
                    } else {
                      next.add(challenge.challengeId);
                    }
                    return next;
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      <section ref={auditRef} className={`scroll-mt-6 ${sectionRule}`}>
        <EvaluationAudit
          hackathonId={hackathonId}
          entryFilter={entryFilter}
          onClearFilter={() => setEntryFilter(null)}
        />
      </section>
    </div>
  );
}

function CalibrationChallengeRow({
  challenge,
  open,
  onToggle,
}: {
  challenge: CalibrationChallenge;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[var(--border-subtle)] py-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-baseline justify-between gap-4 text-left"
      >
        <span className="text-[15px] font-semibold text-[var(--text-primary)]">
          {challenge.challenge}
        </span>
        <span className={meta}>
          {plural(challenge.judges.length, "judge")} · {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <ul className="mt-3 space-y-3">
          {challenge.judges.map((judge) => (
            <li key={judge.judgeId}>
              <p className="text-[15px] text-[var(--text-primary)]">
                <span className="font-semibold">{judge.judgeName}</span>
                {judge.kind === "guest" && (
                  <span className={meta}> (guest)</span>
                )}
              </p>
              <p className={body}>{describeJudge(judge).join(" · ")}</p>
              <p className={`${meta} tabular-nums`}>{judgeNumbers(judge)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EvaluationAudit({
  hackathonId,
  entryFilter,
  onClearFilter,
}: {
  hackathonId: string;
  entryFilter: { id: string; title: string } | null;
  onClearFilter: () => void;
}) {
  const [shown, setShown] = useState(AUDIT_PAGE);
  const [expanded, setExpanded] = useState<{
    id: string;
    view: "appointment" | "history";
  } | null>(null);

  const audit = trpc.judging.results.evaluationAudit.useQuery(
    { hackathonId, entryId: entryFilter?.id },
    { refetchInterval: POLL_MS, placeholderData: (previous) => previous },
  );

  const toggle = (id: string, view: "appointment" | "history") =>
    setExpanded((current) =>
      current?.id === id && current.view === view ? null : { id, view },
    );

  const rows = audit.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className={itemTitle}>Evaluations</h3>
        <span className={meta}>Newest first, up to 500</span>
      </div>
      {entryFilter && (
        <p className={`mt-2 flex flex-wrap items-baseline gap-x-3 ${body}`}>
          <span>
            Only{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {entryFilter.title}
            </span>
          </span>
          <button type="button" onClick={onClearFilter} className={textLink}>
            Show every project
          </button>
        </p>
      )}

      {audit.isLoading ? (
        <p className={`mt-4 ${body}`}>Loading evaluations…</p>
      ) : audit.isError ? (
        <div className="mt-4 flex flex-col items-start gap-4">
          <p className={body}>
            {trpcErrorMessage(audit.error, "Evaluations did not load.")}
          </p>
          <button
            type="button"
            onClick={() => void audit.refetch()}
            className={btnSecondary}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className={`mt-4 ${body}`}>
          No evaluations yet. They appear here as judges submit from their
          desks.
        </p>
      ) : (
        <>
          <ul className="mt-4 border-t border-[var(--border-subtle)]">
            {rows.slice(0, shown).map((row) => (
              <AuditItem
                key={row.id}
                hackathonId={hackathonId}
                row={row}
                expanded={expanded?.id === row.id ? expanded.view : null}
                onToggle={(view) => toggle(row.id, view)}
              />
            ))}
          </ul>
          {rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + AUDIT_PAGE)}
              className={`mt-4 ${textLink}`}
            >
              Show {Math.min(AUDIT_PAGE, rows.length - shown)} more
            </button>
          )}
        </>
      )}
    </div>
  );
}

function AuditItem({
  hackathonId,
  row,
  expanded,
  onToggle,
}: {
  hackathonId: string;
  row: AuditRow;
  expanded: "appointment" | "history" | null;
  onToggle: (view: "appointment" | "history") => void;
}) {
  return (
    <li className="border-b border-[var(--border-subtle)] py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-[var(--text-primary)]">
            <span className="font-semibold">{row.title}</span>
            <span className={meta}> · {row.challenge}</span>
          </p>
          <p className={meta}>
            {row.judgeName}
            {row.kind === "guest" ? " (guest)" : ""} · saved{" "}
            {eventMoment(row.updatedAt)}
            {row.autoSubmitted ? " · submitted at the deadline" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
            {score(row.score)}
          </span>
          <span className={status(row.isComplete ? "success" : "warning")}>
            {row.isComplete ? "Complete" : "Incomplete"}
          </span>
          {row.appointmentId && (
            <button
              type="button"
              aria-expanded={expanded === "appointment"}
              onClick={() => onToggle("appointment")}
              className={textLink}
            >
              Appointment
            </button>
          )}
          <button
            type="button"
            aria-expanded={expanded === "history"}
            onClick={() => onToggle("history")}
            className={textLink}
          >
            History
          </button>
        </div>
      </div>
      {expanded === "appointment" && row.appointmentId && (
        <AppointmentDetail
          hackathonId={hackathonId}
          appointmentId={row.appointmentId}
        />
      )}
      {expanded === "history" && (
        <RevisionHistory hackathonId={hackathonId} evaluationId={row.id} />
      )}
    </li>
  );
}

function AppointmentDetail({
  hackathonId,
  appointmentId,
}: {
  hackathonId: string;
  appointmentId: string;
}) {
  const detail = trpc.judging.results.appointmentResults.useQuery(
    { hackathonId, appointmentId },
    { refetchInterval: POLL_MS },
  );

  if (detail.isLoading) {
    return <p className={`mt-3 ${meta}`}>Loading the appointment…</p>;
  }
  if (detail.isError || !detail.data) {
    return (
      <p className="mt-3 text-[15px] text-[var(--danger)]">
        {trpcErrorMessage(detail.error, "The appointment did not load.")}
      </p>
    );
  }

  const { appointment, average, completeCount, hasResultsElsewhere, judges } =
    detail.data;
  const where = [appointment.building, appointment.room]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-3 border-l-2 border-[var(--border-medium)] pl-4">
      <p className={meta}>
        {appointment.challenge} · {where} · {eventMoment(appointment.startsAt)}{" "}
        to {eventClock(appointment.endsAt)}
      </p>
      <p className={`mt-1 ${body}`}>
        Average{" "}
        <span className="font-semibold text-[var(--text-primary)]">
          {score(average)}
        </span>{" "}
        from {completeCount} complete{" "}
        {completeCount === 1 ? "evaluation" : "evaluations"}.
      </p>
      {hasResultsElsewhere && (
        <p className={meta}>
          This project also has complete evaluations for this challenge outside
          this slot.
        </p>
      )}
      {judges.length === 0 ? (
        <p className={`mt-2 ${meta}`}>No judge has started on this slot.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {judges.map((judge) => (
            <li key={judge.judgeId}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                  {judge.judgeName}
                  {judge.kind === "guest" && (
                    <span className={meta}> (guest)</span>
                  )}
                </p>
                <span
                  className={status(
                    judge.status === "complete"
                      ? "success"
                      : judge.status === "incomplete"
                        ? "warning"
                        : "neutral",
                  )}
                >
                  {judge.status === "complete"
                    ? "Complete"
                    : judge.status === "incomplete"
                      ? "Incomplete"
                      : "Still writing"}
                </span>
                {judge.score !== null && (
                  <span className="text-[15px] tabular-nums text-[var(--text-primary)]">
                    {score(judge.score)}
                  </span>
                )}
                {judge.autoSubmitted && (
                  <span className={meta}>Submitted at the deadline</span>
                )}
              </div>
              {judge.ratings.length > 0 && (
                <p className={`mt-1 ${meta}`}>
                  {judge.ratings
                    .map((rating) => `${rating.label} ${rating.value}`)
                    .join(" · ")}
                </p>
              )}
              {judge.responses.length > 0 && (
                <dl className="mt-2 space-y-2">
                  {judge.responses.map((response) => (
                    <div key={response.itemId}>
                      <dt className={label}>
                        {response.label}
                        {response.isPublic ? "" : " (private)"}
                      </dt>
                      <dd className="whitespace-pre-line text-[15px] text-[var(--text-primary)]">
                        {response.value || "No answer"}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevisionHistory({
  hackathonId,
  evaluationId,
}: {
  hackathonId: string;
  evaluationId: string;
}) {
  const history = trpc.judging.results.revisions.useQuery({
    hackathonId,
    evaluationId,
  });

  if (history.isLoading) {
    return <p className={`mt-3 ${meta}`}>Loading the history…</p>;
  }
  if (history.isError || !history.data) {
    return (
      <p className="mt-3 text-[15px] text-[var(--danger)]">
        {trpcErrorMessage(history.error, "The history did not load.")}
      </p>
    );
  }

  const labels = new Map(
    history.data.rubric.map((item) => [item.id, item.label]),
  );
  const { revisions } = history.data;

  return (
    <div className="mt-3 border-l-2 border-[var(--border-medium)] pl-4">
      {revisions.length === 0 ? (
        <p className={meta}>No saved versions.</p>
      ) : (
        <ol className="space-y-3">
          {revisions.map((revision) => {
            const { ratings, responses, isComplete, auto } = revision.snapshot;
            const written = Object.entries(responses).filter(
              ([, response]) => response.value.trim() !== "",
            );
            return (
              <li key={revision.id}>
                <p className="text-[15px] text-[var(--text-primary)]">
                  <span className="font-semibold">
                    Version {revision.revision}
                  </span>
                  <span className={meta}>
                    {" "}
                    · {eventMoment(revision.createdAt)} ·{" "}
                    {isComplete ? "complete" : "incomplete"}
                    {auto ? " · submitted at the deadline" : ""}
                  </span>
                </p>
                {Object.keys(ratings).length > 0 && (
                  <p className={meta}>
                    {Object.entries(ratings)
                      .map(
                        ([itemId, value]) =>
                          `${labels.get(itemId) ?? "Removed item"} ${value}`,
                      )
                      .join(" · ")}
                  </p>
                )}
                {written.map(([itemId, response]) => (
                  <p key={itemId} className={`line-clamp-2 ${meta}`}>
                    {labels.get(itemId) ?? "Removed item"}: {response.value}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
