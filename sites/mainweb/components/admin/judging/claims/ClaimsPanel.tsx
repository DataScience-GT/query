"use client";

import { useEffect, useState } from "react";
import { Copy, Mail, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnInk,
  btnSecondary,
  input,
  itemTitle,
  meta,
  sectionRule,
  sectionTitle,
  status,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";
import { eventMoment } from "@/components/hackathon/judging/event-time";

/** Delays a fast-changing value so it can drive a query without firing one per
 *  keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

type BatchResult = {
  sent: number;
  failed: string[];
  skipped: { memberId: string; reason: string }[];
};

/**
 * Who has claimed their place on a judged project, and the claim links for
 * those who have not: copy one for the help desk, or email the next batch.
 */
export function ClaimsPanel({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim(), 300);
  const [error, setError] = useState<string | null>(null);
  // Where the current pass through unsent members has reached. Members whose
  // send failed or was skipped sit behind it until the pass ends, so they do
  // not take every batch; the next pass retries them.
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [lastBatch, setLastBatch] = useState<BatchResult | null>(null);
  const [copied, setCopied] = useState<{
    memberId: string;
    url: string;
    ok: boolean;
  } | null>(null);

  const overview = trpc.judging.hacker.claimOverview.useQuery(
    { hackathonId, search: debouncedSearch || undefined },
    { refetchInterval: 10_000, placeholderData: (previous) => previous },
  );

  const sendBatch = trpc.judging.hacker.sendClaimEmails.useMutation({
    onSuccess: (result) => {
      setLastBatch(result);
      setCursor(result.nextCursor ?? undefined);
      void utils.judging.hacker.claimOverview.invalidate({ hackathonId });
    },
    onError: (e) => setError(trpcErrorMessage(e, "No emails were sent.")),
  });

  const claimLink = trpc.judging.hacker.claimLink.useMutation({
    onSuccess: async ({ url }, { memberId }) => {
      let ok = true;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // No clipboard outside a secure context; the link is shown instead.
        ok = false;
      }
      setCopied({ memberId, url, ok });
    },
    onError: (e) => setError(trpcErrorMessage(e, "No link was issued.")),
  });

  useEffect(() => {
    if (!copied?.ok) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (overview.isLoading) {
    return <p className={`py-16 ${body}`}>Loading claims…</p>;
  }

  if (overview.isError || !overview.data) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className={body}>
          {trpcErrorMessage(overview.error, "Claims did not load.")}
        </p>
        <button
          type="button"
          onClick={() => void overview.refetch()}
          className={btnSecondary}
        >
          Try again
        </button>
      </div>
    );
  }

  const { summary, entries, claimsStartedAt, linksExpireAt } = overview.data;
  // As of the last poll, which is at most ten seconds old.
  const linksClosed = linksExpireAt.getTime() <= overview.dataUpdatedAt;
  const nextBatch = Math.min(5, summary.unsent);

  const sendNext = () => {
    // The first email locks the project list for good; say so once.
    if (
      !claimsStartedAt &&
      !window.confirm(
        "Sending the first claim emails locks the project list: Devpost imports can only add projects from now on. Send them?",
      )
    ) {
      return;
    }
    setError(null);
    sendBatch.mutate({ hackathonId, cursor });
  };

  const tiles: { label: string; value: number; tone: Tone | null }[] = [
    { label: "Claimed", value: summary.claimed, tone: "success" },
    { label: "Unclaimed", value: summary.unclaimed, tone: null },
    { label: "Emailed", value: summary.emailed, tone: null },
    { label: "To email", value: summary.unsent, tone: null },
  ];
  if (summary.teamsTooLarge > 0) {
    tiles.push({
      label: "Teams over four",
      value: summary.teamsTooLarge,
      tone: "warning",
    });
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className={sectionTitle}>Claims</h2>
        <p className={`mt-2 ${meta}`}>
          {summary.claimed} of {summary.members} team members claimed across{" "}
          {summary.projects} projects · links work until{" "}
          {eventMoment(linksExpireAt)}
        </p>
        <dl
          className={`mt-6 grid grid-cols-2 gap-y-4 sm:grid-cols-3 lg:grid-cols-5 ${sectionRule}`}
        >
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="border-l border-[var(--border-subtle)] px-4 py-1"
            >
              <dt
                className={
                  tile.tone
                    ? status(tile.tone)
                    : "text-[13px] font-semibold text-[var(--text-subtle)]"
                }
              >
                {tile.label}
              </dt>
              <dd className="mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight tabular-nums text-[var(--text-primary)]">
                {tile.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={sectionRule}>
        <h3 className={itemTitle}>Claim emails</h3>
        <p className={`mt-1 max-w-2xl ${body}`}>
          {linksClosed
            ? "The event has ended, so claim links no longer work. Move the end date first if judging is still running."
            : summary.unsent === 0
              ? "Every unclaimed member has had a claim email. Hackers whose portal email matches Devpost can also claim from their Judging tab without one."
              : `${summary.unsent} unclaimed ${summary.unsent === 1 ? "member has" : "members have"} not been emailed. Each send goes to the next ${nextBatch}, at the address they used on Devpost.`}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={sendNext}
            disabled={
              readOnly ||
              linksClosed ||
              summary.unsent === 0 ||
              sendBatch.isPending
            }
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnInk}
          >
            <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
            {sendBatch.isPending
              ? "Sending…"
              : `Email the next ${nextBatch || 5}`}
          </button>
          {lastBatch && (
            <p role="status" className={meta}>
              Sent {lastBatch.sent}. {summary.unsent} still to email.
            </p>
          )}
        </div>
        {lastBatch &&
          (lastBatch.failed.length > 0 || lastBatch.skipped.length > 0) && (
            <div className="mt-4 max-w-2xl space-y-2 border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]">
              {lastBatch.failed.length > 0 && (
                <p>
                  Did not send to {lastBatch.failed.join(", ")}. They stay in
                  the queue and are retried after this pass.
                </p>
              )}
              {lastBatch.skipped.map((skip) => (
                <p key={skip.memberId}>{skip.reason}</p>
              ))}
            </div>
          )}
      </section>

      {error && (
        <p
          role="alert"
          className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <section className={sectionRule}>
        <div className="relative max-w-md">
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
          />
          <input
            type="search"
            aria-label="Search projects, names and emails"
            placeholder="Project, name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`pl-10 ${input}`}
          />
        </div>

        {entries.length === 0 ? (
          <p className={`mt-6 ${body}`}>
            {debouncedSearch
              ? `No project or team member matches “${debouncedSearch}”.`
              : "No projects in judging yet. Import them from Devpost or promote portal submissions first."}
          </p>
        ) : (
          <ul className="mt-6 border-t border-[var(--border-subtle)]">
            {entries.map((entry) => {
              const claimedCount = entry.members.filter(
                (m) => m.claimed,
              ).length;
              return (
                <li
                  key={entry.entryId}
                  className="border-b border-[var(--border-subtle)] py-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className={`${itemTitle} text-[18px]`}>{entry.title}</p>
                    <span className={meta}>
                      {entry.source === "portal" ? "Portal" : "Devpost"} ·{" "}
                      {claimedCount} of {entry.teamSize} claimed
                    </span>
                  </div>
                  {entry.teamTooLarge && (
                    <p className={`mt-1 ${status("warning")}`}>
                      {entry.teamSize} people listed. Cut the team to four
                      before anyone can claim.
                    </p>
                  )}
                  <ul className="mt-3 space-y-2">
                    {entry.members.map((member) => {
                      const shown = copied?.memberId === member.memberId;
                      return (
                        <li key={member.memberId}>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] text-[var(--text-primary)]">
                                {member.name}
                                <span className={meta}> · {member.email}</span>
                              </p>
                              <p className={meta}>
                                {member.claimed
                                  ? member.claimedBy &&
                                    member.claimedBy.email.toLowerCase() !==
                                      member.email.toLowerCase()
                                    ? `Claimed by ${member.claimedBy.name ?? member.claimedBy.email} (${member.claimedBy.email})`
                                    : member.claimedAt
                                      ? `Claimed ${eventMoment(member.claimedAt)}`
                                      : "Linked from a portal submission"
                                  : member.emailedAt
                                    ? `Emailed ${eventMoment(member.emailedAt)}`
                                    : "Not emailed"}
                                {member.addedByTeammate
                                  ? " · added by a teammate"
                                  : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-4">
                              <span
                                className={status(
                                  member.claimed ? "success" : "neutral",
                                )}
                              >
                                {member.claimed ? "Claimed" : "Unclaimed"}
                              </span>
                              {!member.claimed && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setError(null);
                                    claimLink.mutate({
                                      hackathonId,
                                      memberId: member.memberId,
                                    });
                                  }}
                                  disabled={
                                    readOnly ||
                                    linksClosed ||
                                    entry.teamTooLarge ||
                                    claimLink.isPending
                                  }
                                  title={
                                    readOnly
                                      ? READ_ONLY_TITLE
                                      : `Copy ${member.name}'s claim link`
                                  }
                                  className={`${btnSecondary} px-3 py-1.5`}
                                >
                                  <Copy
                                    size={16}
                                    strokeWidth={1.75}
                                    aria-hidden="true"
                                  />
                                  {shown && copied.ok ? "Copied" : "Copy link"}
                                </button>
                              )}
                            </div>
                          </div>
                          {shown && !copied.ok && (
                            <input
                              readOnly
                              aria-label={`${member.name}'s claim link`}
                              value={copied.url}
                              onFocus={(e) => e.currentTarget.select()}
                              className={`mt-2 font-mono text-[13px] ${input}`}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
