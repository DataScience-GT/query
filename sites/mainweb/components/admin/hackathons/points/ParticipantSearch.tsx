"use client";

import React, { useId, useState } from "react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { body, fieldLabel, input, meta } from "@/components/portal/ui";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { useDebounced } from "./use-debounced";

export type ParticipantMatch =
  RouterOutputs["points"]["store"]["searchParticipants"][number];

/**
 * Find an accepted hacker by name or email and pick one. Shared by the sale
 * station and the points ledger; each match carries what they can spend.
 */
export function ParticipantSearch({
  hackathonId,
  label = "Find a hacker",
  onSelect,
}: {
  hackathonId: string;
  label?: string;
  onSelect: (match: ParticipantMatch) => void;
}) {
  const fieldId = useId();
  const [query, setQuery] = useState("");
  const term = useDebounced(query.trim(), 300);
  const searching = term.length >= 2;

  const results = trpc.points.store.searchParticipants.useQuery(
    { hackathonId, query: term },
    { enabled: searching },
  );

  return (
    <div>
      <label htmlFor={fieldId} className={fieldLabel}>
        {label}
      </label>
      <input
        id={fieldId}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name or email"
        className={`min-h-11 ${input}`}
      />

      {searching && (
        <div className="mt-2" aria-live="polite">
          {results.isLoading ? (
            <p className={`py-2 ${meta}`}>Searching…</p>
          ) : results.isError ? (
            <p className="py-2 text-[15px] text-[var(--danger)]">
              {trpcErrorMessage(results.error, "Search failed. Try again.")}
            </p>
          ) : (results.data?.length ?? 0) === 0 ? (
            <p className={`py-2 ${body}`}>
              Nobody accepted matches &ldquo;{term}&rdquo;. Try part of their
              email.
            </p>
          ) : (
            <ul className="border-t border-[var(--border-subtle)]">
              {results.data?.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(match);
                      setQuery("");
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-1 py-2.5 text-left transition-colors hover:bg-[var(--bg-secondary)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-[var(--text-primary)]">
                        {match.name}
                      </span>
                      <span className={`flex flex-wrap gap-x-3 ${meta}`}>
                        <span className="truncate">{match.email}</span>
                        <StatusBadge status={match.registrationStatus} />
                      </span>
                    </span>
                    <span className="shrink-0 text-[15px] tabular-nums text-[var(--text-primary)]">
                      {match.balance.available.toLocaleString("en-US")}
                      <span className={`ml-1 ${meta}`}>pts</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
