"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE } from "@/lib/use-portal-context";
import { body, fieldHint, fieldLabel, input, meta, status } from "@/components/portal/ui";
import { pointsLabel } from "@/components/hackathon/points/format";
import { useDebounced } from "./use-debounced";

/**
 * The station for people without a phone: find them by name or email and
 * tap. It never admits anyone to the hackathon; arrival is the registration
 * desk, so people who have not been there show as not ready.
 */
export function ManualCheckIn({
  hackathonId,
  eventId,
  readOnly,
  onCheckedIn,
}: {
  hackathonId: string;
  eventId: string;
  readOnly: boolean;
  onCheckedIn: () => void;
}) {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const term = useDebounced(query.trim(), 300);
  const searching = term.length >= 2;
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const results = trpc.hackathon.searchEventCheckIn.useQuery(
    { hackathonId, eventId, query: term },
    { enabled: searching },
  );

  const checkIn = trpc.hackathon.manualEventCheckIn.useMutation({
    onSuccess: (result) => {
      setOutcome({
        ok: true,
        text:
          result.pointsAwarded > 0
            ? `${result.name} is checked into ${result.eventName}, ${pointsLabel(result.pointsAwarded)}.`
            : `${result.name} is checked into ${result.eventName}.`,
      });
      void utils.hackathon.searchEventCheckIn.invalidate({ hackathonId, eventId });
      onCheckedIn();
    },
    onError: (error) =>
      setOutcome({
        ok: false,
        text: trpcErrorMessage(error, "That check-in did not go through."),
      }),
  });

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="manual-check-in-search" className={fieldLabel}>
          Name or email
        </label>
        <input
          id="manual-check-in-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ada or ada@gatech.edu"
          className={`min-h-11 ${input}`}
        />
        <p className={fieldHint}>Tap a name to check them in.</p>
      </div>

      {outcome && (
        <p
          role={outcome.ok ? "status" : "alert"}
          className={`text-[15px] ${outcome.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {outcome.text}
        </p>
      )}

      {searching &&
        (results.isLoading ? (
          <p className={meta}>Searching…</p>
        ) : results.isError ? (
          <p className="text-[15px] text-[var(--danger)]">
            {trpcErrorMessage(results.error, "Search failed. Try again.")}
          </p>
        ) : (results.data?.length ?? 0) === 0 ? (
          <p className={body}>
            Nobody accepted matches &ldquo;{term}&rdquo;. Try part of their
            email.
          </p>
        ) : (
          <ul className="border-t border-[var(--border-subtle)]">
            {results.data?.map((person) => {
              const arrived = person.registrationStatus === "checked_in";
              const busy =
                checkIn.isPending && checkIn.variables?.participantId === person.id;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={
                      readOnly ||
                      person.checkedIntoEvent ||
                      !arrived ||
                      checkIn.isPending
                    }
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    onClick={() => {
                      setOutcome(null);
                      checkIn.mutate({
                        hackathonId,
                        eventId,
                        participantId: person.id,
                      });
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-1 py-2.5 text-left transition-colors enabled:hover:bg-[var(--bg-secondary)] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-[var(--text-primary)]">
                        {person.name}
                      </span>
                      <span className={`block truncate ${meta}`}>
                        {person.email}
                      </span>
                    </span>
                    <span className="max-w-[11rem] shrink-0 text-right">
                      {person.checkedIntoEvent ? (
                        <span className={status("success")}>Checked in</span>
                      ) : !arrived ? (
                        <span className={status("warning")}>
                          Ask an admin to mark them checked in.
                        </span>
                      ) : (
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                          {busy ? "Checking in…" : "Check in"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
