"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  meta,
  sectionRule,
  textLink,
} from "@/components/portal/ui";
import { ErrorLine, plural } from "@/components/admin/judging/shared";
import { clock, slotTime } from "./format";
import type { ScheduleBoard } from "./format";

type Judging = NonNullable<ScheduleBoard["judging"]>;

const SHOWN_AT_FIRST = 8;

/**
 * Who grades what: assigning judges to the presentations that have not
 * started, the slots where judges run short, and each judge's load.
 */
export function JudgesPanel({
  hackathonId,
  judging,
  windowStart,
}: {
  hackathonId: string;
  judging: Judging;
  windowStart: Date;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [showAll, setShowAll] = useState(false);

  const assign = trpc.judging.schedule.assignJudges.useMutation({
    onSuccess: () => utils.judging.schedule.get.invalidate({ hackathonId }),
    // Appointments or judges changed while it worked: the board reloads and
    // the message says to run it again.
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        void utils.judging.schedule.get.invalidate({ hackathonId });
      }
    },
  });

  const setAuto = trpc.judging.schedule.setAutoRebalance.useMutation({
    onSuccess: () => utils.judging.schedule.get.invalidate({ hackathonId }),
  });

  const { warnings, loads } = judging;
  const shownLoads = showAll ? loads : loads.slice(0, SHOWN_AT_FIRST);

  return (
    <section
      aria-labelledby="judges-title"
      className={`${sectionRule} space-y-6`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id="judges-title" className={itemTitle}>
            Judges
          </h3>
          <p className={`mt-1 max-w-2xl ${body}`}>
            Every presentation is graded once, by one judge. Table judges take
            general judging; a sponsor&apos;s judges take only their own
            challenge, at their own room or table.
          </p>
          <p className={`mt-1 ${meta}`}>
            {judging.judges === 0
              ? "No judge has joined a room or table yet. Judges appear here once they have."
              : judging.unassigned === 0
                ? `${plural(judging.assigned, "presentation")} with a judge. Every upcoming one has its judge.`
                : `${plural(judging.assigned, "presentation")} with a judge, ${judging.unassigned} still waiting for one.`}
          </p>
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={judging.autoRebalance}
              disabled={readOnly || setAuto.isPending}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              onChange={(e) =>
                setAuto.mutate({ hackathonId, enabled: e.target.checked })
              }
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Re-balance automatically
          </label>
          <p className={meta}>
            When a judge leaves for 5 minutes, goes quiet for 10, or misses a
            presentation, their upcoming presentations go to judges who are
            here.
          </p>
          {judging.lastRebalancedAt && judging.lastRebalanceChanged > 0 && (
            <p className={meta}>
              Last re-balanced {clock(judging.lastRebalancedAt)}:{" "}
              {plural(judging.lastRebalanceChanged, "presentation")} moved.
            </p>
          )}
          {setAuto.error && (
            <ErrorLine>
              {trpcErrorMessage(setAuto.error, "Could not save that setting.")}
            </ErrorLine>
          )}
        </div>
        <div className="shrink-0 space-y-2 sm:max-w-xs">
          <button
            type="button"
            onClick={() => assign.mutate({ hackathonId })}
            disabled={readOnly || assign.isPending || judging.judges === 0}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={judging.unassigned > 0 ? btnPrimary : btnSecondary}
          >
            {assign.isPending ? "Assigning…" : "Assign judges"}
          </button>
          <p className={meta}>
            Picks again for presentations that have not started. The rest keep
            their judge.
          </p>
        </div>
      </div>

      <div aria-live="polite" className="space-y-3">
        {assign.error && (
          <ErrorLine>
            {trpcErrorMessage(assign.error, "Could not assign judges.")}
          </ErrorLine>
        )}
        {assign.data && (
          <p className={meta} role="status">
            {assign.data.changed === 0
              ? "Nothing changed: every upcoming presentation already has the judge it would get."
              : `${plural(assign.data.changed, "presentation")} given a judge, worked out by ${assign.data.solver === "cp-sat" ? "CP-SAT" : "the in-app assigner"}.`}
          </p>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="max-w-3xl space-y-3 border-l-2 border-[var(--warning)] pl-4">
          <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">
            {plural(warnings.length, "slot has", "slots have")} too few judges
            for the presentations in it. Add judges, or move presentations to
            another time.
          </p>
          <ul className={`space-y-1 ${meta}`}>
            {warnings.slice(0, SHOWN_AT_FIRST).map((w) => (
              <li key={`${w.slot}:${w.challengeId}`}>
                {w.message}, at {slotTime(w.startsAt, windowStart)}
              </li>
            ))}
            {warnings.length > SHOWN_AT_FIRST && (
              <li>and {warnings.length - SHOWN_AT_FIRST} more</li>
            )}
          </ul>
        </div>
      )}

      {loads.length > 0 && (
        <div>
          <h4 className={`${label} mb-2`}>Presentations per judge</h4>
          <ul className="grid gap-x-10 border-t border-[var(--border-subtle)] sm:grid-cols-2">
            {shownLoads.map((judge) => (
              <li
                key={judge.judgeId}
                className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle)] py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-[var(--text-primary)]">
                    {judge.name}
                  </span>
                  <span className={`block truncate ${meta}`}>
                    {judge.kind === "guest"
                      ? ["Guest", judge.roomName].filter(Boolean).join(" · ")
                      : judge.kind === "member"
                        ? "Table judge"
                        : "Not judging"}
                    {judge.available ? "" : " · has no room or table now"}
                  </span>
                </span>
                <span className="text-[15px] tabular-nums text-[var(--text-primary)]">
                  {judge.load}
                  <span className="sr-only"> presentations</span>
                </span>
              </li>
            ))}
          </ul>
          {loads.length > shownLoads.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={`${textLink} mt-3`}
            >
              Show all {loads.length}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
