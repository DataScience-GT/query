"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  body,
  btnPrimary,
  btnSecondary,
  input,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  ICON_STROKE,
  clockTime,
  countdown,
  countdownTone,
  formatScore,
  linkHost,
  roomPlace,
  startsIn,
  toneText,
} from "./desk";
import type { ProjectSheet } from "./desk";
import { missingItems, onRubric, storedForm } from "./answers";
import type { Answer } from "./answers";
import { useDraftAutosave } from "./use-draft-autosave";
import type { SaveStatus } from "./use-draft-autosave";
import { useServerNow } from "./use-server-now";

const MAX_RESPONSE = 2000;

function BackButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-primary)]"
    >
      <ArrowLeft
        className="h-4 w-4"
        strokeWidth={ICON_STROKE}
        aria-hidden="true"
      />
      Projects
    </button>
  );
}

/** One project, opened for evaluation. */
export function EvaluationSheet({
  hackathonId,
  entryId,
  challengeId,
  onClose,
}: {
  hackathonId: string;
  entryId: string;
  challengeId: string | undefined;
  onClose: () => void;
}) {
  const [reloads, setReloads] = useState(0);
  const sheet = trpc.judging.desk.project.useQuery(
    { hackathonId, entryId, challengeId },
    { refetchInterval: 15_000 },
  );
  const now = useServerNow(sheet.data?.serverNow, sheet.dataUpdatedAt);

  // The project list may have been scrolled far down; the project starts at
  // its title.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [entryId]);

  if (sheet.isPending) {
    return (
      <>
        <BackButton onClose={onClose} />
        <p role="status" className={`mt-8 ${meta}`}>
          Opening the project…
        </p>
      </>
    );
  }

  if (!sheet.data) {
    return (
      <>
        <BackButton onClose={onClose} />
        <div role="alert" className="mt-8">
          <p className={body}>
            {trpcErrorMessage(sheet.error, "This project did not open.")}
          </p>
          <button
            type="button"
            className={`${btnSecondary} mt-4 min-h-11`}
            onClick={() => void sheet.refetch()}
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  const data = sheet.data;
  // A new submission (the judge's own, another window's, or the one made for
  // them when time ran out), a deadline starting or ending, or access
  // changing all restart the editor from what the server now holds.
  const version = [
    data.entry.id,
    data.challenge.id,
    data.evaluation?.revision ?? 0,
    data.access.deadlineAt?.getTime() ?? "untimed",
    data.access.canEdit ? "open" : "shut",
    reloads,
  ].join(":");

  return (
    <>
      <BackButton onClose={onClose} />
      <EvaluationForm
        key={version}
        hackathonId={hackathonId}
        data={data}
        now={now}
        refresh={sheet.refetch}
        onReload={() =>
          void sheet.refetch().then(() => setReloads((n) => n + 1))
        }
      />
    </>
  );
}

function EvaluationForm({
  hackathonId,
  data,
  now,
  refresh,
  onReload,
}: {
  hackathonId: string;
  data: ProjectSheet;
  now: number | null;
  /** Stable: React Query's refetch. */
  refresh: () => Promise<unknown>;
  onReload: () => void;
}) {
  const utils = trpc.useUtils();
  const { entry, challenge, rubric, evaluation, draft, access, presentation } =
    data;
  const ratingItems = rubric.filter((item) => item.kind === "rating");
  const responseItems = rubric.filter((item) => item.kind === "response");

  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    onRubric(draft?.ratings ?? evaluation?.ratings ?? {}, ratingItems),
  );
  const [responses, setResponses] = useState<Record<string, Answer>>(() =>
    onRubric(draft?.responses ?? evaluation?.responses ?? {}, responseItems),
  );
  const [showMissing, setShowMissing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [readMore, setReadMore] = useState(false);
  // From the tap until the editor reopens on the submitted evaluation, so a
  // second tap cannot send the same revision twice.
  const [sending, setSending] = useState(false);

  const deadlineAt = access.deadlineAt;
  const secondsLeft =
    deadlineAt && now !== null
      ? Math.ceil((deadlineAt.getTime() - now) / 1000)
      : null;
  const timeUp = secondsLeft !== null && secondsLeft <= 0;
  const opensIn =
    access.opensAt && now !== null ? access.opensAt.getTime() - now : null;
  const opensNow = opensIn !== null && opensIn <= 0;

  const submit = trpc.judging.desk.submit.useMutation();
  const writable = access.canEdit && !timeUp;
  const editable = writable && !sending;

  const autosave = useDraftAutosave({
    answersKey: JSON.stringify([ratings, responses]),
    enabled: writable,
    revision: draft?.revision ?? 0,
    save: (revision) =>
      utils.client.judging.desk.saveDraft.mutate({
        hackathonId,
        entryId: entry.id,
        challengeId: challenge.id,
        ratings,
        responses,
        revision,
      }),
  });
  const { hold, release } = autosave;

  // When the clock runs out the server submits the draft on its next read.
  // Ask for that read now rather than wait for the poll.
  useEffect(() => {
    if (!timeUp) return;
    void hold();
    const timer = setTimeout(() => void refresh(), 1500);
    return () => clearTimeout(timer);
  }, [timeUp, hold, refresh]);

  // Likewise when the presentation starts.
  useEffect(() => {
    if (opensNow && !access.canEdit) void refresh();
  }, [opensNow, access.canEdit, refresh]);

  const missing = missingItems(rubric, ratings, responses);
  const missingIds = new Set(showMissing ? missing.map((item) => item.id) : []);
  const changed =
    !evaluation ||
    storedForm(rubric, ratings, responses) !==
      storedForm(rubric, evaluation.ratings, evaluation.responses);

  async function send() {
    if (missing.length > 0) {
      setShowMissing(true);
      setSubmitError(
        `Still to answer: ${missing.map((item) => item.label).join(", ")}.`,
      );
      return;
    }
    setSubmitError(null);
    setSending(true);
    await hold();
    submit.mutate(
      {
        hackathonId,
        entryId: entry.id,
        challengeId: challenge.id,
        ratings,
        responses,
        expectedRevision: evaluation?.revision ?? 0,
      },
      {
        onSuccess: () => {
          void utils.judging.desk.project.invalidate({ hackathonId });
          void utils.judging.desk.projects.invalidate({ hackathonId });
          void utils.judging.desk.myEvaluations.invalidate({ hackathonId });
        },
        onError: (error) => {
          release();
          setSending(false);
          setSubmitError(
            trpcErrorMessage(
              error,
              "Your evaluation did not submit. Try again.",
            ),
          );
        },
      },
    );
  }

  const links = [
    ...new Set(
      [entry.submissionUrl, ...entry.demoLinks].filter(
        (href): href is string => !!href,
      ),
    ),
  ];

  return (
    <>
      <header className="mt-2">
        <p className={meta}>
          {challenge.label}
          {presentation &&
            ` · ${clockTime(presentation.startsAt)} · ${roomPlace(presentation.roomName, presentation.buildingName)}`}
        </p>
        <h1 className={`mt-1 ${sectionTitle} break-words`}>{entry.title}</h1>
        <p className={`mt-2 ${body}`}>
          {entry.members.length > 0
            ? entry.members.join(", ")
            : entry.participantCount === 1
              ? "Solo project"
              : `Team of ${entry.participantCount}`}
        </p>
        {entry.challenges.length > 0 && (
          <p className={`mt-1 ${meta}`}>
            Entered in {entry.challenges.map((c) => c.label).join(", ")}
          </p>
        )}

        {(links.length > 0 || entry.videoUrl) && (
          <ul className="mt-2 flex flex-wrap gap-x-5">
            {links.map((href) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${textLink} min-h-11`}
                >
                  {linkHost(href)}
                  <ExternalLink
                    className="h-3.5 w-3.5"
                    strokeWidth={ICON_STROKE}
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
            {entry.videoUrl && (
              <li>
                <a
                  href={entry.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${textLink} min-h-11`}
                >
                  Demo video
                  <ExternalLink
                    className="h-3.5 w-3.5"
                    strokeWidth={ICON_STROKE}
                    aria-hidden="true"
                  />
                </a>
              </li>
            )}
          </ul>
        )}

        {entry.description && (
          <div className="mt-3">
            <p
              className={`${body} whitespace-pre-line break-words ${readMore ? "" : "line-clamp-4"}`}
            >
              {entry.description}
            </p>
            {entry.description.length > 240 && (
              <button
                type="button"
                className={`${textLink} min-h-11`}
                aria-expanded={readMore}
                onClick={() => setReadMore((open) => !open)}
              >
                {readMore ? "Show less" : "Read the whole description"}
              </button>
            )}
          </div>
        )}
        {entry.technologies.length > 0 && (
          <p className={`mt-2 ${meta}`}>
            Built with {entry.technologies.join(", ")}
          </p>
        )}
      </header>

      <AccessNotice data={data} opensIn={opensIn} />

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {ratingItems.length > 0 && (
          <section className={sectionRule} aria-label="Ratings">
            <h2 className={label}>
              Rate each from 1 (weak) to 5 (outstanding)
            </h2>
            <div className="mt-4 space-y-7">
              {ratingItems.map((item) => (
                <fieldset key={item.id} disabled={!editable}>
                  <legend className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {item.label}
                  </legend>
                  {item.description && (
                    <p className={`mt-1 ${meta}`}>{item.description}</p>
                  )}
                  {missingIds.has(item.id) && (
                    <p className={`mt-1 ${status("danger")}`}>Pick a rating</p>
                  )}
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const picked = ratings[item.id] === value;
                      return (
                        <label
                          key={value}
                          className={`flex h-12 items-center justify-center rounded-[var(--radius-sm)] border text-[17px] font-semibold tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                            picked
                              ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                              : "border-[var(--border-medium)] text-[var(--text-primary)]"
                          } ${editable ? "cursor-pointer hover:border-[var(--border-hover)]" : "cursor-not-allowed opacity-60"}`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={item.id}
                            value={value}
                            checked={picked}
                            onChange={() =>
                              setRatings((current) => ({
                                ...current,
                                [item.id]: value,
                              }))
                            }
                          />
                          {value}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        )}

        {responseItems.length > 0 && (
          <section
            className={`mt-10 ${sectionRule}`}
            aria-label="Written feedback"
          >
            <h2 className={label}>Written feedback</h2>
            <div className="mt-4 space-y-7">
              {responseItems.map((item) => {
                const answer = responses[item.id];
                const shared =
                  item.visibility === "public" ||
                  (item.visibility === "optional" && answer?.isPublic === true);
                return (
                  <div key={item.id}>
                    <label
                      htmlFor={`response-${item.id}`}
                      className="block text-[15px] font-semibold text-[var(--text-primary)]"
                    >
                      {item.label}
                      {!item.required && (
                        <span className="font-normal text-[var(--text-subtle)]">
                          {" "}
                          (optional)
                        </span>
                      )}
                    </label>
                    {item.description && (
                      <p className={`mt-1 ${meta}`}>{item.description}</p>
                    )}
                    {missingIds.has(item.id) && (
                      <p className={`mt-1 ${status("danger")}`}>
                        Write an answer
                      </p>
                    )}
                    <textarea
                      id={`response-${item.id}`}
                      className={`${input} mt-2 min-h-28 resize-y`}
                      maxLength={MAX_RESPONSE}
                      disabled={!editable}
                      value={answer?.value ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setResponses((current) => ({
                          ...current,
                          [item.id]: {
                            value,
                            isPublic: current[item.id]?.isPublic ?? false,
                          },
                        }));
                      }}
                    />
                    {item.visibility === "optional" ? (
                      <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-[var(--text-muted)]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                          disabled={!editable}
                          checked={answer?.isPublic === true}
                          onChange={(e) => {
                            const isPublic = e.target.checked;
                            setResponses((current) => ({
                              ...current,
                              [item.id]: {
                                value: current[item.id]?.value ?? "",
                                isPublic,
                              },
                            }));
                          }}
                        />
                        Share this answer with the team
                      </label>
                    ) : null}
                    <p className={`mt-1 flex items-center gap-1.5 ${meta}`}>
                      {shared ? (
                        <Eye
                          className="h-3.5 w-3.5 shrink-0"
                          strokeWidth={ICON_STROKE}
                          aria-hidden="true"
                        />
                      ) : (
                        <EyeOff
                          className="h-3.5 w-3.5 shrink-0"
                          strokeWidth={ICON_STROKE}
                          aria-hidden="true"
                        />
                      )}
                      {shared
                        ? "The team reads this, without your name."
                        : "Only organisers and judges read this."}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {data.scores && <Scores data={data} />}

        <div className="sticky bottom-0 z-10 -mx-5 mt-10 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:-mx-8 sm:px-8">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              {secondsLeft !== null && (
                <p
                  role="timer"
                  aria-label="Time left to judge"
                  className={`text-[22px] font-semibold leading-tight tabular-nums ${toneText[countdownTone(secondsLeft)]}`}
                >
                  {countdown(secondsLeft)}
                  <span className="ml-1.5 text-[13px] font-normal text-[var(--text-subtle)]">
                    left
                  </span>
                </p>
              )}
              <p className={meta} aria-live="polite">
                {timeUp
                  ? "Time is up. Checking what was saved…"
                  : saveLine(
                      autosave.status,
                      writable,
                      draft?.updatedAt ?? null,
                    )}
              </p>
              {autosave.status.kind === "stopped" && (
                <span className="flex flex-wrap gap-x-4">
                  <button
                    type="button"
                    className={`${textLink} min-h-11`}
                    onClick={autosave.retry}
                  >
                    Try saving again
                  </button>
                  <button
                    type="button"
                    className={`${textLink} min-h-11`}
                    onClick={onReload}
                  >
                    Reload saved answers
                  </button>
                </span>
              )}
            </div>
            <button
              type="submit"
              className={`${btnPrimary} min-h-11 shrink-0`}
              disabled={!editable || !changed}
            >
              {sending && !submit.isSuccess
                ? "Submitting…"
                : submit.isSuccess || (evaluation && !changed)
                  ? "Submitted"
                  : evaluation
                    ? "Update"
                    : "Submit"}
            </button>
          </div>
          {submitError && (
            <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">
              {submitError}
            </p>
          )}
        </div>
      </form>
    </>
  );
}

function saveLine(
  saving: SaveStatus,
  writable: boolean,
  restoredAt: Date | null,
): string {
  switch (saving.kind) {
    case "saving":
      return "Saving…";
    case "saved":
      return `Saved ${clockTime(saving.at)}`;
    case "retrying":
      return "Not saved yet. Retrying…";
    case "stopped":
      return `Saving stopped after 5 tries. ${saving.message}`;
    case "idle":
      if (!writable) return "";
      return restoredAt
        ? `Draft from ${clockTime(restoredAt)} restored`
        : "Answers save as you go";
  }
}

/** Why the judge cannot write yet, or what happened to what they wrote. */
function AccessNotice({
  data,
  opensIn,
}: {
  data: ProjectSheet;
  opensIn: number | null;
}) {
  const { access, evaluation } = data;

  if (!access.canEdit && access.reason) {
    const heading = access.opensAt
      ? `Opens ${clockTime(access.opensAt)}${opensIn !== null && opensIn > 0 ? `, ${startsIn(opensIn)}` : ""}`
      : access.judgingState === "closed"
        ? "Read-only"
        : "Not open to you yet";
    return (
      <div className="mt-6">
        <p className={status("warning")}>{heading}</p>
        <p className={`mt-1 ${body}`}>{access.reason}</p>
      </div>
    );
  }

  if (!evaluation) return null;

  if (evaluation.autoSubmittedAt) {
    return (
      <div className="mt-6">
        <p className={status("warning")}>
          Submitted for you at {clockTime(evaluation.autoSubmittedAt)}
        </p>
        <p className={`mt-1 ${body}`}>
          {evaluation.isComplete
            ? "Time ran out with every question answered. You can still change your answers."
            : "Time ran out before you finished, so it counts as incomplete. Answer the rest and submit again."}
        </p>
      </div>
    );
  }

  const edited =
    evaluation.updatedAt.getTime() > evaluation.submittedAt.getTime();
  return (
    <p className={`mt-6 ${status("success")}`}>
      Submitted {clockTime(evaluation.submittedAt)}
      {edited ? `, last changed ${clockTime(evaluation.updatedAt)}` : ""}
    </p>
  );
}

function Scores({ data }: { data: ProjectSheet }) {
  const { scores, evaluation, challenge } = data;
  if (!scores) return null;
  const count = (n: number) => `${n} ${n === 1 ? "evaluation" : "evaluations"}`;

  return (
    <section className={`mt-10 ${sectionRule}`} aria-label="Scores">
      <h2 className={label}>Scores so far</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        {evaluation?.score != null && (
          <div>
            <dt className={meta}>Your score</dt>
            <dd className="mt-0.5 font-[family-name:var(--font-display)] text-[28px] font-semibold tabular-nums text-[var(--text-primary)]">
              {formatScore(evaluation.score)}
            </dd>
          </div>
        )}
        <div>
          <dt className={meta}>{challenge.label}</dt>
          <dd className="mt-0.5 font-[family-name:var(--font-display)] text-[28px] font-semibold tabular-nums text-[var(--text-primary)]">
            {formatScore(scores.challenge.score)}
          </dd>
          <dd className={meta}>{count(scores.challenge.count)}</dd>
        </div>
        {scores.overall && (
          <div>
            <dt className={meta}>Every challenge</dt>
            <dd className="mt-0.5 font-[family-name:var(--font-display)] text-[28px] font-semibold tabular-nums text-[var(--text-primary)]">
              {formatScore(scores.overall.score)}
            </dd>
            <dd className={meta}>{count(scores.overall.count)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
