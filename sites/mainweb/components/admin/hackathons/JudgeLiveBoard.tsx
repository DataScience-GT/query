"use client";

import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

const FALLBACK_STATUS = {
  label: "Between tables",
  className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

const STATUS: Record<string, { label: string; className: string }> = {
  not_started: {
    label: "Not started",
    className: "border-red-500/30 bg-red-500/10 text-red-300",
  },
  judging: {
    label: "Judging",
    className: "border-accent/30 bg-accent/10 text-accent",
  },
  between: {
    label: "Between tables",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  done: {
    label: "Done",
    className:
      "border-[var(--border-subtle)] bg-white/5 text-[var(--text-muted)]",
  },
  suspended: {
    label: "Suspended",
    className:
      "border-[var(--border-subtle)] bg-white/5 text-[var(--text-subtle)]",
  },
};

const mins = (n: number | null) => (n === null ? "-" : `${n}m`);

/** Where every judge is, refreshed while judging runs. */
export function JudgeLiveBoard({
  hackathonId,
  active,
}: {
  hackathonId: string;
  active: boolean;
}) {
  const { data, isLoading } = trpc.judge.liveProgress.useQuery(
    { hackathonId },
    { enabled: !!hackathonId, refetchInterval: active ? 15000 : false },
  );

  const judges = data?.judges ?? [];

  return (
    <LiquidGlass className="p-6">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-tight">
            Judge Floor
          </h2>
          <p className="text-xs font-mono text-text-muted mt-1">
            {active
              ? "Live, refreshing every 15 seconds"
              : "Judging is not running — this is the last known state"}
          </p>
        </div>
        {data && (
          <p className="text-sm font-mono text-[var(--text-primary)] shrink-0">
            {data.totals.completed}/{data.totals.assigned} visits ·{" "}
            <span className="text-accent">{data.totals.percent}%</span>
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs font-mono text-text-muted">Reading the floor…</p>
      ) : judges.length === 0 ? (
        <p className="text-xs font-mono text-text-muted">
          No queues yet. Press Prepare Judging above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-subtle)] text-left">
                <th className="pb-2 pr-4">Judge</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">At</th>
                <th className="pb-2 pr-4">Done</th>
                <th className="pb-2 pr-4">Idle</th>
                <th className="pb-2">Median</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {judges.map((j) => {
                const s = STATUS[j.status] ?? FALLBACK_STATUS;
                return (
                  <tr key={j.judgeId} className="align-top">
                    <td className="py-3 pr-4">
                      <p className="text-[var(--text-primary)]">
                        {j.name ?? j.email ?? "Unnamed judge"}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-block px-2 py-1 border text-[10px] font-mono uppercase tracking-widest ${s.className}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-[var(--text-muted)]">
                      {j.current ? (
                        <>
                          Table {j.current.tableNumber ?? "?"}
                          <span className="block text-[10px] text-[var(--text-subtle)]">
                            {mins(j.current.onItMinutes)} on it
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-[var(--text-primary)]">
                      {j.completed}/{j.assigned}
                    </td>
                    <td
                      className={`py-3 pr-4 font-mono text-xs ${
                        (j.idleMinutes ?? 0) >= 20 && j.status !== "done"
                          ? "text-red-400"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {mins(j.idleMinutes)}
                    </td>
                    <td className="py-3 font-mono text-xs text-[var(--text-muted)]">
                      {j.medianSeconds === null
                        ? "-"
                        : `${Math.round(j.medianSeconds / 60)}m`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </LiquidGlass>
  );
}
