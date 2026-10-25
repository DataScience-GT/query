"use client";

import { useState } from "react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { eventMoment } from "@/components/hackathon/judging/event-time";
import {
  body,
  btnDanger,
  btnInk,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";
import {
  ErrorLine,
  OFFICER_POLL_MS,
  NoticeLine,
  Toggle,
  plural,
  useRefreshJudging,
} from "@/components/admin/judging/shared";

type Flag = RouterOutputs["judging"]["admin"]["getRepoCheck"]["flagged"][number];

const OUTCOME: Record<Flag["outcome"], { label: string; tone: Tone }> = {
  ok: { label: "On time", tone: "success" },
  late: { label: "Pushed after the deadline", tone: "danger" },
  no_repo: { label: "No repo link", tone: "warning" },
  unreadable: { label: "Repo not readable", tone: "warning" },
  error: { label: "Could not check", tone: "neutral" },
};

const DECISION: Record<Flag["decision"], { label: string; tone: Tone }> = {
  pending: { label: "Waiting for you", tone: "warning" },
  disqualified: { label: "Disqualified", tone: "danger" },
  cleared: { label: "Cleared", tone: "success" },
};

const MAX_NOTE = 500;

/**
 * The late-push check: flags projects whose GitHub repo was pushed to after
 * the submission deadline, for an organiser to confirm or clear.
 */
export function RepoCheckSection({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const check = trpc.judging.admin.getRepoCheck.useQuery(
    { hackathonId },
    { refetchInterval: OFFICER_POLL_MS },
  );
  const configure = trpc.judging.admin.setRepoCheck.useMutation({
    onSuccess: () => void refresh(),
  });
  const runNow = trpc.judging.admin.runRepoCheckNow.useMutation({
    onSuccess: () => void refresh(),
  });

  const [grace, setGrace] = useState<string | null>(null);
  const data = check.data;
  const graceText = grace ?? String(data?.graceMinutes ?? 0);
  const graceValue = Number(graceText);
  const graceValid =
    graceText.trim() !== "" &&
    Number.isInteger(graceValue) &&
    graceValue >= 0 &&
    graceValue <= 1440;

  return (
    <div className="space-y-10">
      <div>
        <h2 className={sectionTitle}>Repo check</h2>
        <p className={`mt-1 max-w-2xl ${meta}`}>
          Looks at each project&apos;s GitHub repo and flags the ones pushed to
          after the submission deadline. It goes by GitHub&apos;s own record of
          the last push, on any branch. Commit dates are shown for context
          only: they come from the hacker&apos;s computer and can be set to
          anything. Nothing is disqualified until you confirm it.
        </p>
      </div>

      {check.isLoading ? (
        <p className={body}>Loading the repo check…</p>
      ) : check.isError || !data ? (
        <p className={body}>
          {trpcErrorMessage(check.error, "Could not load the repo check.")}{" "}
          <button
            type="button"
            onClick={() => check.refetch()}
            className={textLink}
          >
            Try again
          </button>
        </p>
      ) : (
        <>
          {!data.hasToken && (
            <NoticeLine>
              No GitHub token is configured (<code>GITHUB_TOKEN</code>), so
              GitHub allows only 60 requests an hour. That is roughly
              one request per repo; projects past it are left as &quot;could
              not check&quot; and picked up on later runs. Ask whoever runs the
              deployment to add a token before judging day.
            </NoticeLine>
          )}
          <section>
            <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
              <Toggle
                id="repo-check-enabled"
                label="Check repos while judging is open"
                hint={
                  data.judgingOpen
                    ? "Runs every 15 minutes while someone has this console open."
                    : "Runs every 15 minutes once judging is open. Check now works any time."
                }
                checked={data.enabled}
                disabled={readOnly || configure.isPending}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                onChange={(enabled) =>
                  configure.mutate({ hackathonId, enabled })
                }
              />
            </div>
            {configure.error && (
              <div className="mt-3">
                <ErrorLine>
                  {trpcErrorMessage(configure.error, "Could not save that.")}
                </ErrorLine>
              </div>
            )}
          </section>

          <section className={sectionRule}>
            <form
              className="max-w-md space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!graceValid) return;
                configure.mutate(
                  { hackathonId, graceMinutes: graceValue },
                  { onSuccess: () => setGrace(null) },
                );
              }}
            >
              <h3 className={label}>Deadline</h3>
              <p className={body}>
                Submissions close {eventMoment(new Date(data.deadline))}{" "}
                (Eastern).
              </p>
              <div>
                <label htmlFor="repo-check-grace" className={fieldLabel}>
                  Grace in minutes
                </label>
                <input
                  id="repo-check-grace"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1440}
                  value={graceText}
                  onChange={(e) => setGrace(e.target.value)}
                  className={input}
                />
                <p className={fieldHint}>
                  Only pushes after the deadline plus this many minutes are
                  flagged.
                </p>
              </div>
              <button
                type="submit"
                disabled={
                  readOnly ||
                  !graceValid ||
                  graceValue === data.graceMinutes ||
                  configure.isPending
                }
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnSecondary}
              >
                Save grace
              </button>
            </form>
          </section>

          <section className={sectionRule}>
            <h3 className={label}>Run</h3>
            <p className={`mt-2 ${body}`}>
              {data.running
                ? "Checking repos now. Results appear here as they come in."
                : data.lastRunAt
                  ? `Last run ${eventMoment(new Date(data.lastRunAt))} Eastern.`
                  : "Not run yet."}{" "}
              {plural(data.checked, "project")} checked.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => runNow.mutate({ hackathonId })}
                disabled={readOnly || runNow.isPending || data.running}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnSecondary}
              >
                {runNow.isPending || data.running ? "Checking…" : "Check now"}
              </button>
            </div>
            {runNow.error && (
              <div className="mt-3">
                <ErrorLine>
                  {trpcErrorMessage(runNow.error, "Could not start the check.")}
                </ErrorLine>
              </div>
            )}
          </section>

          <section className={sectionRule}>
            <h3 className={label}>Flagged projects</h3>
            {data.flagged.length === 0 ? (
              <p className={`mt-3 ${body}`}>
                {data.checked === 0
                  ? "Nothing checked yet."
                  : "No project is flagged."}
              </p>
            ) : (
              <ul className="mt-3 border-t border-[var(--border-subtle)]">
                {data.flagged.map((flag) => (
                  <FlagRow
                    key={flag.entryId}
                    hackathonId={hackathonId}
                    flag={flag}
                    deadline={new Date(data.deadline)}
                    graceMinutes={data.graceMinutes}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function FlagRow({
  hackathonId,
  flag,
  deadline,
  graceMinutes,
}: {
  hackathonId: string;
  flag: Flag;
  deadline: Date;
  graceMinutes: number;
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const utils = trpc.useUtils();
  const [note, setNote] = useState("");
  // A disqualification or a reinstatement changes the public results, which
  // the portal keeps fresh for minutes, so drop that copy too.
  const onSuccess = () => {
    setNote("");
    void refresh();
    void utils.hackathon.getResults.invalidate();
  };
  const decide = trpc.judging.admin.decideRepoCheck.useMutation({ onSuccess });
  const reinstate = trpc.judging.admin.reinstateRepoCheck.useMutation({
    onSuccess,
  });
  const busy = decide.isPending || reinstate.isPending;
  const error = decide.error ?? reinstate.error;

  const outcome = OUTCOME[flag.outcome];
  const decision = DECISION[flag.decision];
  const parts = flag.repos ?? [];
  const common = { hackathonId, entryId: flag.entryId, note: note.trim() || undefined };

  return (
    <li className="border-b border-[var(--border-subtle)] py-4">
      <p className="text-[15px] font-semibold text-[var(--text-primary)]">
        {flag.title}
      </p>
      <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${meta}`}>
        <span className={status(outcome.tone)}>{outcome.label}</span>
        <span className={status(decision.tone)}>{decision.label}</span>
        <span>Checked {eventMoment(new Date(flag.checkedAt))}</span>
      </p>
      {flag.lastOutcome && flag.lastOutcome !== flag.outcome && (
        <p className={`mt-2 ${meta}`}>
          Latest check: {OUTCOME[flag.lastOutcome].label.toLowerCase()}. The flag
          above is from an earlier one and stays until you decide.
        </p>
      )}
      {flag.note && (
        <p className={`mt-2 ${meta}`}>
          Note: <span className="text-[var(--text-secondary)]">{flag.note}</span>
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {parts.map((part) => (
          <RepoPart
            key={`${part.owner}/${part.repo}`}
            part={part}
            deadline={deadline}
            graceMinutes={graceMinutes}
          />
        ))}
      </ul>

      <div className="mt-4 max-w-xl">
        <label htmlFor={`repo-note-${flag.entryId}`} className={fieldLabel}>
          Note (optional)
        </label>
        <input
          id={`repo-note-${flag.entryId}`}
          type="text"
          maxLength={MAX_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={input}
        />
        <p className={fieldHint}>
          Kept with the decision for organisers. Hackers and the public results
          never see it.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {flag.decision !== "disqualified" && (
          <button
            type="button"
            onClick={() =>
              decide.mutate({ ...common, decision: "disqualified" })
            }
            disabled={readOnly || busy}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnDanger}
          >
            Disqualify
          </button>
        )}
        {flag.decision !== "disqualified" && !flag.removedEntry && (
          <button
            type="button"
            onClick={() => decide.mutate({ ...common, decision: "cleared" })}
            disabled={readOnly || busy}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnInk}
          >
            Clear
          </button>
        )}
        {(flag.decision === "disqualified" || flag.removedEntry) && (
          <button
            type="button"
            onClick={() => reinstate.mutate(common)}
            disabled={readOnly || busy}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            Reinstate
          </button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <ErrorLine>{trpcErrorMessage(error, "Could not save that.")}</ErrorLine>
        </div>
      )}
    </li>
  );
}

type Part = NonNullable<Flag["repos"]>[number];

/** One linked repo of a flagged project: its last push and the evidence. */
function RepoPart({
  part,
  deadline,
  graceMinutes,
}: {
  part: Part;
  deadline: Date;
  graceMinutes: number;
}) {
  const repo = `${part.owner}/${part.repo}`;
  const outcome = OUTCOME[part.outcome];
  const commits = part.evidence?.commits ?? [];
  const pushes = part.evidence?.pushes ?? [];
  return (
    <li>
      <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${meta}`}>
        <a
          href={`https://github.com/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className={textLink}
        >
          {repo}
        </a>
        <span className={status(outcome.tone)}>{outcome.label}</span>
      </p>
      {part.outcome === "late" && part.pushedAt && (
        <p className={`mt-1 ${body}`}>
          Last push {eventMoment(new Date(part.pushedAt))}, deadline{" "}
          {eventMoment(deadline)}
          {graceMinutes > 0 ? ` plus ${graceMinutes} minutes` : ""} (Eastern).
        </p>
      )}
      {(commits.length > 0 || pushes.length > 0) && (
        <details className="mt-2">
          <summary className={`cursor-pointer ${textLink}`}>
            Evidence: {plural(pushes.length, "push", "pushes")},{" "}
            {plural(commits.length, "commit")}
          </summary>
          <div className="mt-3 space-y-4">
            {pushes.length > 0 && (
              <div>
                <p className={label}>Pushes after the deadline</p>
                <ul className="mt-1 space-y-1">
                  {pushes.map((push) => (
                    <li key={`${push.at}${push.ref}`} className={body}>
                      {eventMoment(new Date(push.at))} · {push.ref ?? "a branch"}
                      {push.pusher ? ` · ${push.pusher}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {commits.length > 0 && (
              <div>
                <p className={label}>
                  Commits since the deadline (dates are the hacker&apos;s own,
                  for context only)
                </p>
                <ul className="mt-1 space-y-1">
                  {commits.map((commit) => (
                    <li key={commit.sha} className={body}>
                      <a
                        href={commit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={textLink}
                      >
                        {commit.sha.slice(0, 7)}
                      </a>{" "}
                      {commit.message}
                      {commit.author ? ` · ${commit.author}` : ""}
                      {commit.committedAt
                        ? ` · ${eventMoment(new Date(commit.committedAt))}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className={meta}>
              Pushes to any branch count. Only the latest 20 of each are kept.
            </p>
          </div>
        </details>
      )}
    </li>
  );
}
