"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE } from "@/lib/use-portal-context";
import {
  body,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  meta,
  status,
} from "@/components/portal/ui";
import { pointsLabel } from "@/components/hackathon/points/format";
import { useDebounced } from "./use-debounced";

const rowClass =
  "flex min-h-11 w-full items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-1 py-2.5";

function PersonLabel({ name, email }: { name: string; email: string }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[15px] text-[var(--text-primary)]">
        {name}
      </span>
      <span className={`block truncate ${meta}`}>{email}</span>
    </span>
  );
}

/**
 * The station for people without a phone: find them by name or email and
 * tap. Tapping a name checks them into the event only once they have arrived.
 * Admitting somebody to the hackathon is its own button, pressed after their
 * photo ID has been looked at, because a name in a search box is not proof
 * they are who they say.
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

  const admit = trpc.hackathon.admit.useMutation({
    onSuccess: (result) => {
      setOutcome({
        ok: true,
        text:
          result.pointsAwarded > 0
            ? `${result.name} is admitted and checked into ${result.eventName}, ${pointsLabel(result.pointsAwarded)}.`
            : `${result.name} is admitted and checked into ${result.eventName}.`,
      });
      void utils.hackathon.searchEventCheckIn.invalidate({ hackathonId, eventId });
      onCheckedIn();
    },
    onError: (error) =>
      setOutcome({
        ok: false,
        text: trpcErrorMessage(error, "That admission did not go through."),
      }),
  });

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
        <p className={fieldHint}>
          Tap a name to check them in. Someone not admitted to the hackathon yet
          needs Admit (ID checked) first.
        </p>
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
              const admitting =
                admit.isPending && admit.variables?.participantId === person.id;
              return (
                <li key={person.id}>
                  {arrived ? (
                    <button
                      type="button"
                      disabled={
                        readOnly || person.checkedIntoEvent || checkIn.isPending
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
                      className={`${rowClass} text-left transition-colors enabled:hover:bg-[var(--bg-secondary)] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent`}
                    >
                      <PersonLabel name={person.name} email={person.email} />
                      <span className="max-w-[11rem] shrink-0 text-right">
                        {person.checkedIntoEvent ? (
                          <span className={status("success")}>Checked in</span>
                        ) : (
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                            {busy ? "Checking in…" : "Check in"}
                          </span>
                        )}
                      </span>
                    </button>
                  ) : (
                    // The row is not a button: the admit control sits inside it.
                    <div className={rowClass}>
                      <PersonLabel name={person.name} email={person.email} />
                      <button
                        type="button"
                        disabled={readOnly || admit.isPending}
                        title={readOnly ? READ_ONLY_TITLE : undefined}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Admit ${person.name}?\n\nOnly do this after checking their photo ID. It checks them into the hackathon and into this event.`,
                            )
                          )
                            return;
                          setOutcome(null);
                          admit.mutate({
                            hackathonId,
                            eventId,
                            participantId: person.id,
                          });
                        }}
                        className={`shrink-0 ${btnSecondary}`}
                      >
                        {admitting ? "Admitting…" : "Admit (ID checked)"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
