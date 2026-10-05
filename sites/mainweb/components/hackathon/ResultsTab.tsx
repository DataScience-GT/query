"use client";

import { trpc } from "@/lib/trpc";
import {
  body,
  btnSecondary,
  itemTitle,
  meta,
  textLink,
} from "@/components/portal/ui";

/**
 * The published placings.
 *
 * Reads `hackathon.getResults`, which returns only rows an organiser has
 * actually published — so this shows nothing until Publish is pressed, and
 * goes back to showing nothing if it is unpublished. Without this the publish
 * button was a no-op that told the organiser "everyone will see them
 * immediately", and the winners existed only inside one admin response.
 */
export function ResultsTab({ hackathonId }: { hackathonId: string }) {
  const {
    data: results,
    isLoading,
    isError,
    refetch,
  } = trpc.hackathon.getResults.useQuery({ hackathonId });

  if (isLoading) {
    return <p className={`py-16 ${body}`}>Loading results…</p>;
  }

  // Distinguished from "no results yet": a failed request rendered as an empty
  // state reads as "we did not place anyone", which is a different and much
  // worse message on the one page teams check after the ceremony.
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className={body}>
          We could not load the results just now. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className={btnSecondary}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div>
        <h3 className={itemTitle}>Results not published yet</h3>
        <p className={`mt-1 ${body}`}>
          They will appear here once judging is finished and the organisers
          release them.
        </p>
      </div>
    );
  }

  return (
    <ol className="border-t border-[var(--border-subtle)]">
      {results.map((row) => {
        const name =
          row.sourceProject?.name ?? row.project?.name ?? "Unknown project";
        const team = row.sourceProject?.team?.name ?? row.project?.teamMembers;
        return (
          <li
            key={row.id}
            className="flex items-baseline gap-5 sm:gap-8 border-b border-[var(--border-subtle)] py-5"
          >
            <span
              className={`w-10 sm:w-14 shrink-0 font-[family-name:var(--font-display)] text-[40px] sm:text-[56px] font-semibold leading-none tabular-nums ${
                row.placement === 1
                  ? "text-accent"
                  : row.placement <= 3
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-subtle)]"
              }`}
            >
              {row.placement}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`${itemTitle} truncate`}>{name}</p>
              {team ? <p className={`${meta} truncate`}>{team}</p> : null}
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {row.sourceProject?.githubUrl ? (
                <a
                  href={row.sourceProject.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={textLink}
                >
                  Code
                </a>
              ) : null}
              {row.sourceProject?.demoUrl ? (
                <a
                  href={row.sourceProject.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={textLink}
                >
                  Demo
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
