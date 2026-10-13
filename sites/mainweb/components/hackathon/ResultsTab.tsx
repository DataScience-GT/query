"use client";

import { trpc } from "@/lib/trpc";
import {
  body,
  btnSecondary,
  itemTitle,
  label,
  meta,
  textLink,
} from "@/components/portal/ui";

/**
 * The published placings.
 *
 * Reads `hackathon.getResults`, which returns only rows an organiser has
 * actually published — so this shows nothing until results are published, and
 * goes back to showing nothing if they are unpublished. Rows come grouped:
 * overall first, then each prize, each in placing order.
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

  // The server already orders by scope, then placing.
  const groups: { scope: string; label: string; rows: typeof results }[] = [];
  for (const row of results) {
    const last = groups[groups.length - 1];
    if (last && last.scope === row.scope) last.rows.push(row);
    else groups.push({ scope: row.scope, label: row.scopeLabel, rows: [row] });
  }
  const showLabels = groups.length > 1 || groups[0]?.scope !== "overall";

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.scope}>
          {showLabels && <h3 className={`mb-3 ${label}`}>{group.label}</h3>}
          <ol className="border-t border-[var(--border-subtle)]">
            {group.rows.map((row) => (
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
                  <p className={`${itemTitle} truncate`}>{row.projectName}</p>
                  {row.teamName ? (
                    <p className={`${meta} truncate`}>{row.teamName}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {row.githubUrl ? (
                    <a
                      href={row.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={textLink}
                    >
                      Code
                    </a>
                  ) : null}
                  {row.demoUrl ? (
                    <a
                      href={row.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={textLink}
                    >
                      Demo
                    </a>
                  ) : null}
                  {row.submissionUrl ? (
                    <a
                      href={row.submissionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={textLink}
                    >
                      Devpost
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
