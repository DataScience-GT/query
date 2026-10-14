"use client";

import React from "react";
import Link from "next/link";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  body,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  meta,
  sectionRule,
  status,
} from "@/components/portal/ui";
import { CheckInCodeForm } from "./CheckInCodeForm";
import {
  attendanceMethodLabel,
  ordinal,
  pointsLabel,
  signedPoints,
  venueDayTime,
} from "./format";

// Hacker screens poll every 30s; a check-in elsewhere shows up within that.
const POLL = { refetchInterval: 30_000 } as const;

type Summary = RouterOutputs["points"]["me"]["summary"];

type HistoryRow = {
  key: string;
  at: Date;
  title: string;
  detail: string;
  amount: number;
  voided: boolean;
};

// One list, newest first, from the three kinds of row behind the balance.
function historyRows(summary: Summary): HistoryRow[] {
  const rows: HistoryRow[] = [
    ...summary.events.map((row) => ({
      key: `event-${row.id}`,
      at: new Date(row.checkedInAt),
      title: row.eventName,
      detail: [venueDayTime(row.checkedInAt), attendanceMethodLabel(row.method)]
        .filter(Boolean)
        .join(" · "),
      amount: row.points,
      voided: false,
    })),
    ...summary.adjustments.map((row) => ({
      key: `adjustment-${row.id}`,
      at: new Date(row.createdAt),
      title: row.reason,
      detail: `${venueDayTime(row.createdAt)} · From the organisers`,
      amount: row.delta,
      voided: false,
    })),
    ...summary.purchases.map((row) => ({
      key: `purchase-${row.id}`,
      at: new Date(row.createdAt),
      title:
        row.quantity > 1 ? `${row.itemName} × ${row.quantity}` : row.itemName,
      detail: row.voidedAt
        ? `${venueDayTime(row.createdAt)} · Voided, points returned`
        : `${venueDayTime(row.createdAt)} · Store`,
      amount: -row.total,
      voided: !!row.voidedAt,
    })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * A hacker's points for one edition: what they can spend, the code box for
 * checking into an event without a pass, every row behind the total, where
 * they stand, and the store.
 */
export function PointsTab({ hackathonId }: { hackathonId: string }) {
  const summary = trpc.points.me.summary.useQuery({ hackathonId }, POLL);
  const board = trpc.points.me.leaderboard.useQuery(
    { hackathonId, limit: 10 },
    POLL,
  );
  const store = trpc.points.me.store.useQuery({ hackathonId }, POLL);

  if (!summary.data) {
    if (summary.isError) {
      const code = summary.error.data?.code;
      return (
        <div className="max-w-xl space-y-4">
          <p className={body}>
            {code === "NOT_FOUND"
              ? "Points are for registered hackers. Register from the Overview tab."
              : code === "FORBIDDEN"
                ? summary.error.message
                : "Couldn't load your points. Check your connection and try again."}
          </p>
          {code !== "NOT_FOUND" && code !== "FORBIDDEN" && (
            <button
              type="button"
              onClick={() => void summary.refetch()}
              className={`min-h-11 ${btnSecondary}`}
            >
              Try again
            </button>
          )}
        </div>
      );
    }
    return <p className={`py-16 ${body}`}>Loading your points…</p>;
  }

  const { balance, checkedIn } = summary.data;
  const history = historyRows(summary.data);

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
      <div className="min-w-0 space-y-10">
        <section aria-labelledby="points-available">
          <p id="points-available" className={label}>
            Points to spend
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-2">
            <p className="font-[family-name:var(--font-display)] text-[72px] md:text-[88px] font-semibold leading-[0.9] tracking-[-0.03em] tabular-nums text-[var(--text-primary)]">
              {balance.available.toLocaleString("en-US")}
            </p>
            <dl className={`pb-1.5 tabular-nums ${meta}`}>
              <div className="flex gap-1.5">
                <dt>Earned</dt>
                <dd className="text-[var(--text-secondary)]">
                  {balance.earned.toLocaleString("en-US")}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Spent</dt>
                <dd className="text-[var(--text-secondary)]">
                  {balance.spent.toLocaleString("en-US")}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={sectionRule}>
          <h3 className={itemTitle}>Check in to an event</h3>
          <p className={`mt-1 mb-5 ${body}`}>
            {checkedIn
              ? "No pass needed: type the code shown at the event."
              : "Get your pass scanned at check-in. Event codes work once you have arrived."}
          </p>
          {checkedIn ? (
            <CheckInCodeForm hackathonId={hackathonId} />
          ) : (
            <Link
              href={`/hackathons/${hackathonId}?tab=SCHEDULE`}
              className={`min-h-11 ${btnPrimary}`}
            >
              Show my pass
            </Link>
          )}
        </section>

        <section className={sectionRule}>
          <h3 className={itemTitle}>History</h3>
          {history.length === 0 ? (
            <p className={`mt-2 ${body}`}>
              Nothing yet. Check in to workshops, meals and talks to collect
              points.
            </p>
          ) : (
            <ul className="mt-3 border-t border-[var(--border-subtle)]">
              {history.map((row) => (
                <li
                  key={row.key}
                  className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle)] py-3"
                >
                  <div className="min-w-0">
                    <p
                      className={`text-[15px] text-[var(--text-primary)] break-words ${row.voided ? "line-through decoration-[var(--text-subtle)]" : ""}`}
                    >
                      {row.title}
                    </p>
                    <p className={`mt-0.5 ${meta}`}>{row.detail}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[15px] font-semibold tabular-nums ${
                      row.voided
                        ? "text-[var(--text-subtle)] line-through"
                        : row.amount < 0
                          ? "text-[var(--text-muted)]"
                          : "text-[var(--text-primary)]"
                    }`}
                  >
                    {signedPoints(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="min-w-0 space-y-10">
        <section className={`${sectionRule} lg:border-t-0 lg:pt-0`}>
          <h3 className={itemTitle}>Leaderboard</h3>
          {board.data ? (
            <Leaderboard board={board.data} />
          ) : board.isError ? (
            <p className={`mt-2 ${body}`}>
              {trpcErrorMessage(board.error, "Couldn't load the leaderboard.")}{" "}
              It refreshes on its own.
            </p>
          ) : (
            <p className={`mt-2 ${meta}`}>Loading the leaderboard…</p>
          )}
        </section>

        <section className={sectionRule}>
          <h3 className={itemTitle}>Store</h3>
          {store.data ? (
            <StoreView store={store.data} />
          ) : store.isError ? (
            <p className={`mt-2 ${body}`}>
              {trpcErrorMessage(store.error, "Couldn't load the store.")} It
              refreshes on its own.
            </p>
          ) : (
            <p className={`mt-2 ${meta}`}>Loading the store…</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function Leaderboard({
  board,
}: {
  board: RouterOutputs["points"]["me"]["leaderboard"];
}) {
  const last = board.entries[board.entries.length - 1];
  // Below the top of the board, the caller's own row follows a gap.
  const meBelow =
    board.me && !board.entries.some((entry) => entry.isMe) ? board.me : null;

  return (
    <>
      <p className={`mt-1 ${meta}`}>
        {board.me
          ? `You are ${ordinal(board.me.rank)} of ${board.ranked.toLocaleString("en-US")}.`
          : "You join the board once you check in at the registration desk."}
      </p>
      {board.entries.length === 0 ? (
        <p className={`mt-3 ${body}`}>
          Nobody has points yet. The first check-in puts someone on top.
        </p>
      ) : (
        <ol className="mt-3 border-t border-[var(--border-subtle)]">
          {board.entries.map((entry, index) => (
            <LeaderboardRow
              // Names are initials only and can repeat; rank and position
              // together are unique.
              key={`${entry.rank}-${index}`}
              rank={entry.rank}
              name={entry.name}
              earned={entry.earned}
              isMe={entry.isMe}
            />
          ))}
          {meBelow && last && (
            <>
              {meBelow.rank > last.rank + 1 && (
                <li aria-hidden="true" className={`py-1 pl-9 ${meta}`}>
                  ⋯
                </li>
              )}
              <LeaderboardRow
                rank={meBelow.rank}
                name="You"
                earned={meBelow.earned}
                isMe
              />
            </>
          )}
        </ol>
      )}
    </>
  );
}

function LeaderboardRow({
  rank,
  name,
  earned,
  isMe,
}: {
  rank: number;
  name: string;
  earned: number;
  isMe: boolean;
}) {
  return (
    <li
      aria-current={isMe ? "true" : undefined}
      className={`flex items-baseline gap-3 border-b border-[var(--border-subtle)] py-2.5 text-[15px] ${
        isMe ? "border-l-2 border-l-accent pl-2.5" : ""
      }`}
    >
      <span className="w-6 shrink-0 text-right text-[13px] tabular-nums text-[var(--text-subtle)]">
        {rank}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${isMe ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
      >
        {name}
        {isMe && name !== "You" && (
          <span className={`ml-1.5 ${meta}`}>(you)</span>
        )}
      </span>
      <span className="shrink-0 tabular-nums text-[var(--text-primary)]">
        {earned.toLocaleString("en-US")}
      </span>
    </li>
  );
}

function StoreView({ store }: { store: RouterOutputs["points"]["me"]["store"] }) {
  return (
    <>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={status(store.open ? "success" : "neutral")}>
          {store.open ? "Open" : "Closed"}
        </span>
        {store.location && (
          <span className={meta}>Pick up at {store.location}</span>
        )}
      </p>

      {!store.catalogVisible ? (
        <p className={`mt-3 ${body}`}>
          The catalog goes up here before the store opens.
        </p>
      ) : !store.checkedIn ? (
        <p className={`mt-3 ${body}`}>
          Check in at the registration desk to see what is on the table.
        </p>
      ) : store.items.length === 0 ? (
        <p className={`mt-3 ${body}`}>
          Nothing in the store yet. Items appear here as organisers add them.
        </p>
      ) : (
        <ul className="mt-3 border-t border-[var(--border-subtle)]">
          {store.items.map((item) => (
            <li
              key={item.id}
              className="border-b border-[var(--border-subtle)] py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={`min-w-0 break-words text-[15px] font-semibold ${item.soldOut ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}
                >
                  {item.name}
                </p>
                <span className="shrink-0 text-[15px] tabular-nums text-[var(--text-primary)]">
                  {pointsLabel(item.price)}
                </span>
              </div>
              {item.description && (
                <p className={`mt-0.5 line-clamp-2 ${meta}`}>
                  {item.description}
                </p>
              )}
              <p className="mt-1 flex flex-wrap gap-x-3">
                {item.soldOut ? (
                  <span className={status("neutral")}>Sold out</span>
                ) : (
                  <>
                    {item.pointsShort > 0 ? (
                      <span className={meta}>
                        {item.pointsShort.toLocaleString("en-US")} more{" "}
                        {item.pointsShort === 1 ? "point" : "points"}
                      </span>
                    ) : (
                      <span className={status("success")}>You have enough</span>
                    )}
                    {item.stock !== null && (
                      <span className={meta}>{item.stock} left</span>
                    )}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
