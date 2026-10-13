"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  body,
  input,
  itemTitle,
  meta,
  sectionRule,
  sectionTitle,
  status,
} from "@/components/portal/ui";
import { PointsLedger } from "./PointsLedger";

// Officer screens poll every 10s.
const POLL = { refetchInterval: 10_000 } as const;

// Enough to find anyone by scrolling the top of the board; the filter finds
// the rest without rendering a thousand rows.
const BOARD_ROWS = 100;

const th = "px-3 py-2.5 text-[13px] font-medium text-[var(--text-subtle)]";
const td = "px-3 py-2.5";

/**
 * Points for one edition, staff side: the whole leaderboard with spending,
 * one hacker's ledger with a manual adjustment, and what each event paid out.
 */
export function PointsAdminTab({ hackathonId }: { hackathonId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const board = trpc.points.admin.leaderboard.useQuery({ hackathonId }, POLL);
  const attendance = trpc.points.admin.attendance.useQuery(
    { hackathonId },
    POLL,
  );

  const rows = board.data ?? [];
  const term = filter.trim().toLowerCase();
  const filtered = term
    ? rows.filter(
        (row) =>
          row.name.toLowerCase().includes(term) ||
          row.email.toLowerCase().includes(term),
      )
    : rows;
  const shown = filtered.slice(0, BOARD_ROWS);

  const awarded = (attendance.data ?? []).reduce(
    (sum, event) => sum + event.pointsAwarded,
    0,
  );
  const spent = rows.reduce((sum, row) => sum + row.spent, 0);

  const select = (participantId: string) => {
    setSelectedId(participantId);
    // Stacked layout: the ledger is below the board, out of sight.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      document
        .getElementById("points-ledger")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="space-y-10">
      <section>
        <h2 className={sectionTitle}>Points</h2>
        <p className={`mt-1 tabular-nums ${meta}`}>
          {rows.length.toLocaleString("en-US")} checked-in hackers ·{" "}
          {awarded.toLocaleString("en-US")} points from events ·{" "}
          {spent.toLocaleString("en-US")} spent at the store
        </p>
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12">
        <section className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h3 className={itemTitle}>Leaderboard</h3>
            <input
              type="search"
              aria-label="Filter the leaderboard by name or email"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or email"
              className={`min-h-11 sm:max-w-xs ${input}`}
            />
          </div>

          {board.isLoading ? (
            <p className={`mt-4 ${meta}`}>Loading the leaderboard…</p>
          ) : board.isError && !board.data ? (
            <p className="mt-4 text-[15px] text-[var(--danger)]">
              {trpcErrorMessage(board.error, "Couldn't load the leaderboard.")}{" "}
              It retries every few seconds.
            </p>
          ) : rows.length === 0 ? (
            <p className={`mt-4 border-t border-[var(--border-subtle)] pt-4 ${body}`}>
              Nobody is checked in yet. Hackers join the board when their pass
              is scanned at the registration desk.
            </p>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto border-t border-[var(--border-subtle)]">
                <table className="w-full min-w-[540px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      <th className={`${th} w-12 text-right`}>Rank</th>
                      <th className={th}>Hacker</th>
                      <th className={`${th} text-right`}>Earned</th>
                      <th className={`${th} text-right`}>Spent</th>
                      <th className={`${th} text-right`}>To spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${td} py-8 ${body}`}>
                          Nobody on the board matches &ldquo;{filter.trim()}
                          &rdquo;. Use Find a hacker for someone not yet
                          checked in.
                        </td>
                      </tr>
                    ) : (
                      shown.map((row) => {
                        const selected = row.participantId === selectedId;
                        return (
                          <tr
                            key={row.participantId}
                            className={`border-b border-[var(--border-subtle)] tabular-nums ${selected ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--bg-secondary)]"}`}
                          >
                            <td className={`${td} text-right text-[var(--text-subtle)]`}>
                              {row.rank}
                            </td>
                            <td className={`${td} max-w-0 w-full`}>
                              <button
                                type="button"
                                onClick={() => select(row.participantId)}
                                aria-pressed={selected}
                                className="block w-full min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              >
                                <span className="block truncate text-[15px] font-semibold text-[var(--text-primary)]">
                                  {row.name}
                                </span>
                                <span className={`block truncate ${meta}`}>
                                  {row.email}
                                </span>
                              </button>
                            </td>
                            <td className={`${td} text-right text-[var(--text-primary)]`}>
                              {row.earned.toLocaleString("en-US")}
                            </td>
                            <td className={`${td} text-right text-[var(--text-muted)]`}>
                              {row.spent.toLocaleString("en-US")}
                            </td>
                            <td className={`${td} text-right text-[var(--text-primary)]`}>
                              {row.available.toLocaleString("en-US")}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {filtered.length > BOARD_ROWS && (
                <p className={`mt-3 ${meta}`}>
                  Showing the top {BOARD_ROWS} of{" "}
                  {filtered.length.toLocaleString("en-US")}. Filter to find
                  someone further down.
                </p>
              )}
            </>
          )}
        </section>

        <aside id="points-ledger" className="min-w-0 scroll-mt-24">
          <PointsLedger
            hackathonId={hackathonId}
            participantId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
      </div>

      <section className={sectionRule}>
        <h3 className={itemTitle}>By event</h3>
        <p className={`mt-1 ${meta}`}>
          How each event&apos;s check-ins came in, and what they paid out.
        </p>
        {attendance.isLoading ? (
          <p className={`mt-4 ${meta}`}>Loading events…</p>
        ) : attendance.isError && !attendance.data ? (
          <p className="mt-4 text-[15px] text-[var(--danger)]">
            {trpcErrorMessage(attendance.error, "Couldn't load events.")} It
            retries every few seconds.
          </p>
        ) : (attendance.data?.length ?? 0) === 0 ? (
          <p className={`mt-4 ${body}`}>
            No events yet. Add them under Events, with the points each is
            worth.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto border-t border-[var(--border-subtle)]">
            <table className="w-full min-w-[720px] text-left text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className={th}>Event</th>
                  <th className={`${th} text-right`}>Worth</th>
                  <th className={`${th} text-right`}>Check-ins</th>
                  <th className={`${th} text-right`}>Pass</th>
                  <th className={`${th} text-right`}>Code</th>
                  <th className={`${th} text-right`}>By name</th>
                  <th className={`${th} text-right`}>Paid out</th>
                  <th className={th}>Self check-in</th>
                </tr>
              </thead>
              <tbody>
                {attendance.data?.map((event) => (
                  <tr
                    key={event.eventId}
                    className="border-b border-[var(--border-subtle)]"
                  >
                    <td className={td}>
                      <span className="block text-[15px] text-[var(--text-primary)]">
                        {event.name}
                      </span>
                      <span className={meta}>
                        {new Date(event.startTime).toLocaleString([], {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className={`${td} text-right text-[var(--text-primary)]`}>
                      {event.points}
                    </td>
                    <td className={`${td} text-right text-[var(--text-primary)]`}>
                      {event.total}
                    </td>
                    <td className={`${td} text-right text-[var(--text-muted)]`}>
                      {event.byScan}
                    </td>
                    <td className={`${td} text-right text-[var(--text-muted)]`}>
                      {event.byCode}
                    </td>
                    <td className={`${td} text-right text-[var(--text-muted)]`}>
                      {event.byManual}
                    </td>
                    <td className={`${td} text-right text-[var(--text-primary)]`}>
                      {event.pointsAwarded.toLocaleString("en-US")}
                    </td>
                    <td className={td}>
                      {event.selfCheckIn ? (
                        <span
                          className={status(event.hasCode ? "success" : "warning")}
                        >
                          {event.hasCode ? "On" : "On, no code"}
                        </span>
                      ) : (
                        <span className={status("neutral")}>Off</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
