"use client";

import React from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <LiquidGlass printed className="rounded-sm p-6 text-center">
          <p className="text-3xl font-black text-[var(--text-primary)] tabular-nums">
            {judgeStats.length}
          </p>
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-2">
            Active judges
          </p>
        </LiquidGlass>
        <LiquidGlass printed className="rounded-sm p-6 text-center">
          <p className="text-3xl font-black text-accent tabular-nums">
            {judgeStats.reduce((s, j) => s + j.count, 0)}
          </p>
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-2">
            Total votes
          </p>
        </LiquidGlass>
        <LiquidGlass printed className="rounded-sm p-6 text-center">
          <p className="text-3xl font-black text-accent tabular-nums">
            {judgeStats.length > 0
              ? formatDuration(
                  judgeStats.reduce((s, j) => s + j.totalTime, 0) /
                    judgeStats.reduce((s, j) => s + j.count, 0),
                )
              : "0:00"}
          </p>
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-2">
            Avg time per project
          </p>
        </LiquidGlass>
        <LiquidGlass printed className="rounded-sm p-6 text-center">
          <p
            className={`text-3xl font-black tabular-nums ${judgeStats.reduce((s, j) => s + j.overtimeCount, 0) > 0 ? "text-red-400" : "text-[var(--text-subtle)]"}`}
          >
            {judgeStats.reduce((s, j) => s + j.overtimeCount, 0)}
          </p>
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-2">
            Overtime votes
          </p>
        </LiquidGlass>
      </div>

      {/* Per-Judge Table */}
      <LiquidGlass printed className="rounded-sm overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)]">
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Judge performance
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-subtle)]">
                <th className="text-left py-3 px-6">Judge</th>
                <th className="text-left py-3 px-6">Projects</th>
                <th className="text-left py-3 px-6">Avg score</th>
                <th className="text-left py-3 px-6">Avg time</th>
                <th className="text-left py-3 px-6">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {judgeStats.map((j) => (
                <tr
                  key={j.name}
                  className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="py-4 px-6">
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {j.name}
                    </p>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-lg font-black text-accent tabular-nums">
                      {j.count}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-lg font-black text-[var(--text-primary)] tabular-nums">
                      {(j.totalScore / j.count).toFixed(1)}
                    </span>
                    <span className="text-xs text-[var(--text-subtle)] ml-1">/50</span>
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        j.totalTime / j.count > 300
                          ? "text-red-400"
                          : j.totalTime / j.count > 240
                            ? "text-yellow-400"
                            : "text-[var(--text-muted)]"
                      }`}
                    >
                      {j.count > 0
                        ? formatDuration(j.totalTime / j.count)
                        : "-"}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    {j.overtimeCount > 0 ? (
                      <span className="px-3 py-1 rounded-sm text-[9px] font-black bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-widest">
                        {j.overtimeCount} overtime
                      </span>
                    ) : (
                      <span className="text-[var(--text-subtle)] text-xs">
                        None
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LiquidGlass>
    </div>
  );
}
