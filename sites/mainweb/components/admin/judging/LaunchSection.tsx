"use client";

import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  btnPrimary,
  btnSecondary,
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
  Toggle,
  shortTime,
  useRefreshJudging,
} from "@/components/admin/judging/shared";
import type { Overview } from "@/components/admin/judging/shared";

type State = Overview["config"]["state"];

const STATE: Record<State, { label: string; tone: Tone; line: string }> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    line: "Judges can take their seats and see projects but cannot submit evaluations.",
  },
  open: {
    label: "Open",
    tone: "success",
    line: "Judges can submit and edit evaluations.",
  },
  closed: {
    label: "Closed",
    tone: "warning",
    line: "Evaluations are frozen. Reopen to let judges submit again.",
  },
};

/** Judging's state and the switches flipped on judging day. */
export function LaunchSection({
  hackathonId,
  overview,
}: {
  hackathonId: string;
  overview: Overview;
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const { config, counts, schedule } = overview;

  const setState = trpc.judging.admin.setState.useMutation({
    onSuccess: () => void refresh(),
  });
  const setShowAllScores = trpc.judging.admin.setShowAllScores.useMutation({
    onSuccess: () => void refresh(),
  });
  const setLaunch = trpc.judging.admin.setLaunch.useMutation({
    onSuccess: () => void refresh(),
  });

  const scored = counts.evaluations.total + counts.evaluations.drafts > 0;
  const noRatings = counts.rubric.ratings === 0;
  const current = STATE[config.state];

  const change = (to: State, question?: string) => {
    if (question && !window.confirm(question)) return;
    setState.mutate({ hackathonId, state: to });
  };

  const writeTitle = readOnly ? READ_ONLY_TITLE : undefined;
  const error = setState.error ?? setShowAllScores.error ?? setLaunch.error;

  return (
    <div className="space-y-10">
      <div>
        <h2 className={sectionTitle}>State and launch</h2>
        <p className={`mt-1 max-w-2xl ${meta}`}>
          Changes here reach judges&apos; and hackers&apos; screens within
          half a minute.
        </p>
      </div>

      <section>
        <h3 className={label}>Judging</h3>
        <p className={`mt-3 ${status(current.tone)}`}>{current.label}</p>
        <p className="mt-1 text-[15px] text-[var(--text-primary)]">
          {current.line}
        </p>
        <p className={`mt-1 ${meta}`}>
          {config.openedAt && `First opened ${shortTime(config.openedAt)}.`}
          {config.closedAt && ` Closed ${shortTime(config.closedAt)}.`}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {config.state === "draft" && (
            <button
              type="button"
              onClick={() =>
                change(
                  "open",
                  "Open judging? Judges can submit evaluations from now on, and the rubric is fixed.",
                )
              }
              disabled={readOnly || noRatings || setState.isPending}
              title={writeTitle}
              className={btnPrimary}
            >
              Open judging
            </button>
          )}
          {config.state === "open" && (
            <button
              type="button"
              onClick={() =>
                change(
                  "closed",
                  "Close judging? Judges can no longer submit or edit evaluations.",
                )
              }
              disabled={readOnly || setState.isPending}
              title={writeTitle}
              className={btnSecondary}
            >
              Close judging
            </button>
          )}
          {config.state === "closed" && (
            <button
              type="button"
              onClick={() => change("open")}
              disabled={readOnly || setState.isPending}
              title={writeTitle}
              className={btnSecondary}
            >
              Reopen judging
            </button>
          )}
          {config.state !== "draft" && (
            <button
              type="button"
              onClick={() =>
                change(
                  "draft",
                  "Set judging back to draft? Judges cannot submit until it opens again.",
                )
              }
              disabled={readOnly || scored || setState.isPending}
              title={
                writeTitle ??
                (scored
                  ? "Judges have scored; close judging instead, or drop evaluations from the danger zone."
                  : undefined)
              }
              className={btnSecondary}
            >
              Back to draft
            </button>
          )}
        </div>
        {config.state === "draft" && noRatings && (
          <p className={`mt-3 ${meta}`}>
            Add at least one rating to the{" "}
            <a href="#rubric" className={textLink}>
              rubric
            </a>{" "}
            before opening judging.
          </p>
        )}
      </section>

      <section className={sectionRule}>
        <h3 className={label}>Judges</h3>
        <div className="mt-1 divide-y divide-[var(--border-subtle)]">
          <Toggle
            id="show-all-scores"
            label="Show every project's scores to member judges"
            hint="Off: a judge sees a project's scores only after scoring it. Guest judges never see scores."
            checked={config.showAllScores}
            disabled={readOnly || setShowAllScores.isPending}
            title={writeTitle}
            onChange={(next) =>
              setShowAllScores.mutate({ hackathonId, showAllScores: next })
            }
          />
        </div>
      </section>

      <section className={sectionRule}>
        <h3 className={label}>Hackers</h3>
        <div className="mt-1 divide-y divide-[var(--border-subtle)]">
          <Toggle
            id="itinerary-published"
            label="Publish the itinerary"
            hint={
              !schedule && !config.itineraryPublished
                ? "Shows each team where and when it presents. No schedule is saved yet, so teams would see where but not when."
                : "Shows each team where and when it presents."
            }
            checked={config.itineraryPublished}
            disabled={readOnly || setLaunch.isPending}
            title={writeTitle}
            onChange={(next) =>
              setLaunch.mutate({ hackathonId, itineraryPublished: next })
            }
          />
          <Toggle
            id="emergency-mode"
            label="Emergency mode"
            hint={
              config.emergencyMode ? (
                <span className={status("danger")}>
                  On: project search, team rosters and feedback are hidden
                  from hackers.
                </span>
              ) : (
                "For when the schedule falls apart: hides project search, team rosters and feedback from hackers."
              )
            }
            checked={config.emergencyMode}
            disabled={readOnly || setLaunch.isPending}
            title={writeTitle}
            onChange={(next) => {
              if (
                next &&
                !window.confirm(
                  "Turn on emergency mode? Hackers lose project search, team rosters and feedback until you turn it off.",
                )
              )
                return;
              setLaunch.mutate({ hackathonId, emergencyMode: next });
            }}
          />
        </div>
      </section>

      {error && (
        <ErrorLine>{trpcErrorMessage(error, "That change did not save.")}</ErrorLine>
      )}
    </div>
  );
}
