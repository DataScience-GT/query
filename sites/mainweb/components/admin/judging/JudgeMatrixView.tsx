"use client";

import React from "react";
import { label, sectionTitle, status } from "@/components/portal/ui";

type Project = {
  id: string;
  name: string;
  tableNumber: number;
  zone: string | null;
};

type Vote = {
  score: number;
  durationSeconds: number | null;
  judgeName: string;
};

type Ranking = {
  project: Project;
  votes: Vote[];
};

type RankingsData = {
  rankings: Ranking[];
};

type JudgeMatrixViewProps = {
  rankings: RankingsData | null;
};

export function JudgeMatrixView({ rankings }: JudgeMatrixViewProps) {
  if (!rankings) return null;

  // Build per-judge stats from vote data
  const judgeMap = new Map<
    string,
    {
      name: string;
      totalScore: number;
      count: number;
      totalTime: number;
      overtimeCount: number;
      projects: { name: string; tableNumber: number; zone: string | null }[];
    }
  >();

  rankings.rankings.forEach(
    (r: {
      project: { name: string; tableNumber: number; zone: string | null };
      votes: {
        judgeName: string;
        score: number | null;
        durationSeconds: number | null;
      }[];
    }) => {
      r.votes.forEach(
        (v: {
          judgeName: string;
          score: number | null;
          durationSeconds: number | null;
        }) => {
          const existing = judgeMap.get(v.judgeName) || {
            name: v.judgeName,
            totalScore: 0,
            count: 0,
            totalTime: 0,
            overtimeCount: 0,
            projects: [] as {
              name: string;
              tableNumber: number;
              zone: string | null;
            }[],
          };
          existing.totalScore += v.score || 0;
          existing.count += 1;
          existing.totalTime += v.durationSeconds || 0;
          if (v.durationSeconds && v.durationSeconds > 300)
            existing.overtimeCount += 1;
          existing.projects.push({
            name: r.project.name,
            tableNumber: r.project.tableNumber,
            zone: r.project.zone,
          });
          judgeMap.set(v.judgeName, existing);
        },
      );
    },
  );

  const judgeStats = Array.from(judgeMap.values()).sort(
    (a, b) => b.count - a.count,
  );
  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

  const totalVotes = judgeStats.reduce((s, j) => s + j.count, 0);
  const totalOvertime = judgeStats.reduce((s, j) => s + j.overtimeCount, 0);
  const th = "py-3 px-4 text-[13px] font-medium text-[var(--text-subtle)]";
  const td = "py-3 px-4 text-[14px]";

  return (
    <div className="space-y-10 mb-12">
      {/* Summary */}
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 border-t border-[var(--border-subtle)] pt-6">
        {[
          { label: "Active judges", value: judgeStats.length, tone: "" },
          { label: "Total votes", value: totalVotes, tone: "" },
          {
            label: "Avg time per project",
            value:
              judgeStats.length > 0
                ? formatDuration(
                    judgeStats.reduce((s, j) => s + j.totalTime, 0) /
                      totalVotes,
                  )
                : "0:00",
            tone: "",
          },
          {
            label: "Overtime votes",
            value: totalOvertime,
            tone: totalOvertime > 0 ? "text-[var(--danger)]" : "",
          },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className={label}>{stat.label}</dt>
            <dd
              className={`mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums ${stat.tone || "text-[var(--text-primary)]"}`}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Per-Judge Table */}
      <section>
        <h2 className={`${sectionTitle} mb-4`}>Judge performance</h2>
        <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className={`${th} text-left`}>Judge</th>
                <th className={`${th} text-right`}>Projects</th>
                <th className={`${th} text-right`}>Avg score</th>
                <th className={`${th} text-right`}>Avg time</th>
                <th className={`${th} text-left`}>Overtime</th>
              </tr>
            </thead>
            <tbody>
              {judgeStats.map((j) => (
                <tr
                  key={j.name}
                  className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className={`${td} font-semibold text-[var(--text-primary)]`}>
                    {j.name}
                  </td>
                  <td className={`${td} text-right tabular-nums text-[var(--text-primary)]`}>
                    {j.count}
                  </td>
                  <td className={`${td} text-right tabular-nums text-[var(--text-primary)]`}>
                    {(j.totalScore / j.count).toFixed(1)}
                    <span className="text-[var(--text-subtle)] ml-0.5">/50</span>
                  </td>
                  <td
                    className={`${td} text-right tabular-nums ${
                      j.totalTime / j.count > 300
                        ? "text-[var(--danger)] font-semibold"
                        : j.totalTime / j.count > 240
                          ? "text-[var(--warning)] font-semibold"
                          : "text-[var(--text-muted)]"
                    }`}
                  >
                    {j.count > 0 ? formatDuration(j.totalTime / j.count) : "-"}
                  </td>
                  <td className={td}>
                    {j.overtimeCount > 0 ? (
                      <span className={status("danger")}>
                        {j.overtimeCount} overtime
                      </span>
                    ) : (
                      <span className="text-[var(--text-subtle)]">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
