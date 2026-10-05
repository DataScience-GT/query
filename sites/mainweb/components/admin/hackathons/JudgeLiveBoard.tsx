"use client";

import { trpc } from "@/lib/trpc";
import {
  body,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status as statusClass,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

const FALLBACK_STATUS: { label: string; tone: Tone } = {
  label: "Between tables",
  tone: "warning",
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "danger" },
  judging: { label: "Judging", tone: "accent" },
  between: { label: "Between tables", tone: "warning" },
  suspended: { label: "Suspended", tone: "neutral" },
};

const mins = (n: number | null) => (n === null ? "-" : `${n}m`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const th = "pb-2 pr-4 text-[13px] font-medium text-[var(--text-subtle)]";

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
    <section className={sectionRule}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 mb-6">
        <div>
          <h2 className={sectionTitle}>Judge floor</h2>
          <p className={`mt-1 ${meta}`}>
            {active
              ? "Live. Refreshes every 15 seconds."
              : "Judging isn't running. This is the last known state."}
          </p>
        </div>
        {data && (
          <p className="text-[15px] text-[var(--text-primary)] tabular-nums shrink-0">
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
        <dl className="mb-8 flex flex-wrap gap-y-4">
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
              className="pr-6 mr-6 border-r border-[var(--border-subtle)] last:border-r-0 last:mr-0 last:pr-0"
            >
              <dt className={label}>{stat.label}</dt>
              <dd
                className={`mt-1 font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tabular-nums ${
                  stat.alert ? "text-[var(--warning)]" : "text-[var(--text-primary)]"
                }`}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {isLoading ? (
        <p className={body}>Loading judges…</p>
      ) : judges.length === 0 ? (
        <p className={body}>
          No judges yet. Approve judges on the hackathon&apos;s Judges tab.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[var(--border-subtle)]">
                <th className={th}>Judge</th>
                <th className={th}>Status</th>
                <th className={th}>At</th>
                <th className={`${th} text-right`}>Scored</th>
                <th className={`${th} text-right`}>Idle</th>
                <th className={`${th} pr-0 text-right`}>Median</th>
              </tr>
            </thead>
            <tbody>
              {judges.map((j) => {
                const s = STATUS[j.status] ?? FALLBACK_STATUS;
                return (
                  <tr
                    key={j.judgeId}
                    className="align-top border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <p className="text-[var(--text-primary)]">
                        {j.name ?? j.email ?? "Unnamed judge"}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={statusClass(s.tone)}>{s.label}</span>
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-muted)]">
                      {j.current ? (
                        <>
                          Table {j.current.tableNumber ?? "?"}
                          <span className="block text-[12px] tabular-nums text-[var(--text-subtle)]">
                            {j.current.phase === "walking" ? "Walking" : "At table"}{" "}
                            {mmss(j.current.seconds)}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-[var(--text-primary)]">
                      {j.scored}
                      {j.voided > 0 && (
                        <span className="text-[var(--text-subtle)]"> · {j.voided} void</span>
                      )}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right tabular-nums ${
                        (j.idleMinutes ?? 0) >= 10 && j.status !== "suspended"
                          ? "text-[var(--danger)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {mins(j.idleMinutes)}
                    </td>
                    <td className="py-3 text-right tabular-nums text-[var(--text-muted)]">
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
    </section>
  );
}
