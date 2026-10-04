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
  suspended: {
    label: "Suspended",
    className:
      "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-subtle)]",
  },
};

const mins = (n: number | null) => (n === null ? "-" : `${n}m`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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
    <LiquidGlass printed className="p-6">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Judge floor
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {active
              ? "Live. Refreshes every 15 seconds."
              : "Judging isn't running. This is the last known state."}
          </p>
        </div>
        {data && (
          <p className="text-sm text-[var(--text-primary)] tabular-nums shrink-0">
            {data.totals.scored} scored
            {data.totals.voided > 0 && (
              <span className="text-[var(--text-muted)]">
                {" "}
                · {data.totals.voided} timed out or passed
              </span>
            )}
          </p>
        )}
      </div>

      {/* Whether the judges who turned up can finish: coverage so far and the
          measured pace, never a planned head count. */}
      {data && data.coverage.projects > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: `At ${data.coverage.targetLooks}+ looks`,
              value: `${data.coverage.atTarget}/${data.coverage.projects}`,
            },
            {
              label: "Not yet seen",
              value: String(data.coverage.unseen),
              alert: data.coverage.unseen > 0 && active,
            },
            {
              label: "Judges active",
              value: String(data.pace.activeJudges),
            },
            {
              label: `To ${data.coverage.targetLooks} looks each`,
              value:
                data.pace.minutesToTarget === null
                  ? "-"
                  : data.pace.minutesToTarget === 0
                    ? "Done"
                    : `~${data.pace.minutesToTarget}m`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3"
            >
              <dt className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                {stat.label}
              </dt>
              <dd
                className={`mt-1 text-lg font-bold tabular-nums ${
                  stat.alert ? "text-amber-300" : "text-[var(--text-primary)]"
                }`}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading judges…</p>
      ) : judges.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No judges yet. Approve judges on the hackathon&apos;s Judges tab.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] text-left">
                <th className="pb-2 pr-4">Judge</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">At</th>
                <th className="pb-2 pr-4">Scored</th>
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
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border ${s.className}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-[var(--text-muted)]">
                      {j.current ? (
                        <>
                          Table {j.current.tableNumber ?? "?"}
                          <span className="block text-[10px] text-[var(--text-subtle)]">
                            {j.current.phase === "walking" ? "walking" : "at table"}{" "}
                            {mmss(j.current.seconds)}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs tabular-nums text-[var(--text-primary)]">
                      {j.scored}
                      {j.voided > 0 && (
                        <span className="text-[var(--text-subtle)]"> · {j.voided} void</span>
                      )}
                    </td>
                    <td
                      className={`py-3 pr-4 text-xs tabular-nums ${
                        (j.idleMinutes ?? 0) >= 10 && j.status !== "suspended"
                          ? "text-red-400"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {mins(j.idleMinutes)}
                    </td>
                    <td className="py-3 text-xs tabular-nums text-[var(--text-muted)]">
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
