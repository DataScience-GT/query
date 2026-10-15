"use client";

import { ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { body, btnSecondary, itemTitle } from "@/components/portal/ui";
import {
  ICON_STROKE,
  clockTime,
  deskLabel,
  deskMeta,
  deskStatus,
  formatScore,
} from "./desk";
import type { Submission } from "./desk";

function standing(row: Submission) {
  if (row.withdrawn) return { tone: "neutral" as const, text: "Withdrawn" };
  if (!row.isComplete) return { tone: "warning" as const, text: "Incomplete" };
  return { tone: "success" as const, text: `Score ${formatScore(row.score)}` };
}

/** Everything this judge has submitted in the edition, newest first. */
export function MySubmissions({
  hackathonId,
  onOpen,
}: {
  hackathonId: string;
  onOpen: (entryId: string, challengeId: string) => void;
}) {
  const mine = trpc.judging.desk.myEvaluations.useQuery(
    { hackathonId },
    { refetchInterval: 15_000 },
  );

  if (mine.isPending) {
    return (
      <p role="status" className={`mt-8 ${deskMeta}`}>
        Loading your evaluations…
      </p>
    );
  }
  if (!mine.data) {
    return (
      <div role="alert" className="mt-8">
        <p className={body}>
          {trpcErrorMessage(mine.error, "Your evaluations did not load.")}
        </p>
        <button
          type="button"
          className={`${btnSecondary} mt-3 min-h-11`}
          onClick={() => void mine.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }
  if (mine.data.length === 0) {
    return (
      <p className={`mt-8 ${body}`}>
        Nothing submitted yet. Open a project from Projects to judge it; it
        shows here once you submit.
      </p>
    );
  }

  return (
    <section className="mt-8" aria-label="Your evaluations">
      <h2 className={deskLabel}>
        {mine.data.length} submitted{" "}
        {mine.data.length === 1 ? "evaluation" : "evaluations"}
      </h2>
      <ul className="mt-3 border-t border-[var(--border-subtle)]">
        {mine.data.map((row) => {
          const state = standing(row);
          const when = row.autoSubmittedAt
            ? `Submitted for you ${clockTime(row.autoSubmittedAt)}`
            : `Submitted ${clockTime(row.submittedAt)}`;
          const content = (
            <>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${itemTitle}`}>
                  {row.title}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={deskMeta}>
                    {row.challengeLabel} · {when}
                  </span>
                  <span className={deskStatus(state.tone)}>{state.text}</span>
                </span>
              </span>
              {!row.withdrawn && (
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[var(--text-subtle)]"
                  strokeWidth={ICON_STROKE}
                  aria-hidden="true"
                />
              )}
            </>
          );
          return (
            <li key={row.id} className="border-b border-[var(--border-subtle)]">
              {row.withdrawn ? (
                <div className="flex min-h-11 items-center gap-4 py-4">
                  {content}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen(row.entryId, row.challengeId)}
                  className="flex w-full min-h-11 items-center gap-4 py-4 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
