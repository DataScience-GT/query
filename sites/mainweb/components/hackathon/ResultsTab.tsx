"use client";

import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Trophy } from "lucide-react";

/**
 * The published placings.
 *
 * Reads `hackathon.getResults`, which returns only rows an organiser has
 * actually published — so this shows nothing until Publish is pressed, and
 * goes back to showing nothing if it is unpublished. Without this the publish
 * button was a no-op that told the organiser "everyone will see them
 * immediately", and the winners existed only inside one admin response.
 */
const MEDAL = ["text-yellow-400", "text-slate-300", "text-amber-600"];

export function ResultsTab({ hackathonId }: { hackathonId: string }) {
  const { data: results, isLoading, isError, refetch } =
    trpc.hackathon.getResults.useQuery({ hackathonId });

  if (isLoading) {
    return (
      <div className="text-[var(--text-subtle)] font-mono text-center py-20 animate-pulse">
        Loading results...
      </div>
    );
  }

  // Distinguished from "no results yet": a failed request rendered as an empty
  // state reads as "we did not place anyone", which is a different and much
  // worse message on the one page teams check after the ceremony.
  if (isError) {
    return (
      <LiquidGlass className="p-12 text-center border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          We could not load the results just now.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-white/5 transition-colors"
        >
          Try again
        </button>
      </LiquidGlass>
    );
  }

  if (!results || results.length === 0) {
    return (
      <LiquidGlass className="p-12 text-center border-[var(--border-subtle)]">
        <Trophy className="w-8 h-8 text-[var(--text-subtle)] mx-auto mb-4" />
        <h3 className="text-[var(--text-primary)] font-bold mb-1">
          Results not published yet
        </h3>
        <p className="text-sm text-[var(--text-subtle)] font-mono">
          They will appear here once judging is finished and the organisers
          release them.
        </p>
      </LiquidGlass>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      {results.map((row) => {
        const name =
          row.sourceProject?.name ?? row.project?.name ?? "Unknown project";
        const team = row.sourceProject?.team?.name ?? row.project?.teamMembers;
        return (
          <LiquidGlass
            key={row.id}
            className={`p-5 border-[var(--border-subtle)] ${
              row.placement <= 3 ? "border-accent/30" : ""
            }`}
          >
            <div className="flex items-center gap-5">
              <span
                className={`text-3xl font-black font-mono shrink-0 ${
                  MEDAL[row.placement - 1] ?? "text-[var(--text-subtle)]"
                }`}
              >
                {row.placement}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-[var(--text-primary)] truncate">
                  {name}
                </p>
                {team ? (
                  <p className="text-xs font-mono text-[var(--text-subtle)] truncate">
                    {team}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {row.sourceProject?.githubUrl ? (
                  <a
                    href={row.sourceProject.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-accent transition-colors"
                  >
                    Code
                  </a>
                ) : null}
                {row.sourceProject?.demoUrl ? (
                  <a
                    href={row.sourceProject.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-accent transition-colors"
                  >
                    Demo
                  </a>
                ) : null}
              </div>
            </div>
          </LiquidGlass>
        );
      })}
    </div>
  );
}
