"use client";

import React, { useState } from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

type Project = {
  id: string;
  name: string;
  tableNumber: number;
  zone: string | null;
  category?: string | null;
  teamMembers?: string | null;
  tracks?: string[] | null;
  challenges?: string[] | null;
  isCreateX?: boolean | null;
};

type Vote = {
  score: number;
  scoreCreativity: number | null;
  scoreImpact: number | null;
  scoreScope: number | null;
  scoreClarity: number | null;
  scoreSoundness: number | null;
  comment: string | null;
  durationSeconds: number | null;
  judgeName: string;
};

type Ranking = {
  project: Project;
  totalScore: number;
  voteCount: number;
  avgScore: number;
  categoryAvg: {
    creativity: number;
    impact: number;
    scope: number;
    clarity: number;
    soundness: number;
  };
  votes: Vote[];
  weightedScore: number;
  confidenceLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
};

type Tie = {
  score: number;
  projects: {
    id: string;
    name: string;
    tableNumber: number;
    zone: string | null;
  }[];
};

type RankingsData = {
  rankings: Ranking[];
  globalAvg: number;
  ties: Tie[];
  hasTies: boolean;
};

type ProcessedRanking = Ranking & {
  displayScore: number;
};

type Judge = {
  id: string;
  name: string | null;
  isActive: boolean;
  specialty?: string | null;
  user?: {
    email: string;
    image?: string | null;
  };
  assignments: {
    hackathonId: string;
    track?: string | null;
  }[];
};

type RankingsViewProps = {
  rankings: RankingsData | null;
  processedRankings: ProcessedRanking[];
  selectedTrack: string;
  judges: Judge[];
  selectedHackathon: string | null;
};

export function RankingsView({
  rankings,
  processedRankings,
  selectedTrack,
  judges,
  selectedHackathon,
}: RankingsViewProps) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const confidenceBadge = (level: string) => {
    if (level === "LOW")
      return (
        <span className="ml-2 px-2 py-0.5 rounded-sm text-[8px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          Low
        </span>
      );
    if (level === "MEDIUM")
      return (
        <span className="ml-2 px-2 py-0.5 rounded-sm text-[8px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
          Medium
        </span>
      );
    if (level === "HIGH")
      return (
        <span className="ml-2 px-2 py-0.5 rounded-sm text-[8px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
          High
        </span>
      );
    return (
      <span className="ml-2 px-2 py-0.5 rounded-sm text-[8px] font-bold bg-gray-500/20 text-[var(--text-subtle)] border border-gray-500/30">
        —
      </span>
    );
  };

  return (
    <>
      {/* Download CSV */}
      {rankings && rankings.rankings.length > 0 && (
        <div className="flex justify-end mb-6">
          <button
            type="button"
            onClick={() => {
              const sorted = [...rankings.rankings].sort(
                (a, b) => b.weightedScore - a.weightedScore,
              );
              const headers = [
                "Rank",
                "Project",
                "Table",
                "Main Track",
                "Extra Tracks",
                "Votes",
                "Avg Score",
                "Bayesian Fair Score",
                "Confidence",
                "Judge Details",
              ];
              const rows = sorted.map((r, i) => {
                const judgeDetails = r.votes
                  .map(
                    (v: {
                      judgeName: string;
                      score: number | null;
                      durationSeconds: number | null;
                    }) =>
                      `${v.judgeName}: ${v.score}/50 (${v.durationSeconds ? Math.floor(v.durationSeconds / 60) + ":" + String(v.durationSeconds % 60).padStart(2, "0") : "N/A"})`,
                  )
                  .join(" | ");
                return [
                  i + 1,
                  `"${r.project.name} (${r.project.zone || ""}${r.project.tableNumber})"`,

                  r.project.zone
                    ? `${r.project.zone}${r.project.tableNumber}`
                    : r.project.tableNumber,
                  r.project.tracks?.[0] || "",
                  `"${(r.project.tracks?.slice(1) || []).concat(r.project.challenges || []).join(", ")}"`,
                  r.voteCount,
                  r.avgScore,
                  r.weightedScore,
                  r.confidenceLevel,
                  `"${judgeDetails}"`,
                ].join(",");
              });
              const csv = [headers.join(","), ...rows].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `rankings_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
          >
            Download results CSV
          </button>
        </div>
      )}
      {/* Tie Warning — Overall */}
      {rankings?.hasTies && (
        <LiquidGlass printed className="border border-yellow-500/30 p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <h3 className="text-xl font-bold text-yellow-500 tracking-wider font-oswald uppercase">
              Tied scores
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rankings.ties.map(
              (
                tie: {
                  score: number;
                  projects: {
                    id: string;
                    name: string;
                    tableNumber: number;
                    zone: string | null;
                  }[];
                },
                i: number,
              ) => (
                <div
                  key={i}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4 rounded-sm"
                >
                  <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    Weighted score: {tie.score}
                  </p>
                  <div className="space-y-1">
                    {tie.projects.map((p) => (
                      <p
                        key={p.id}
                        className="text-[var(--text-primary)] text-sm"
                      >
                        {p.name}{" "}
                        <span className="text-[var(--text-subtle)]">
                          ({p.zone || ""}
                          {p.tableNumber})
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
          <p className="text-sm text-yellow-500/80 mt-6 text-center border-t border-[var(--border-subtle)] pt-4">
            Break these ties by hand before announcing winners.
          </p>
        </LiquidGlass>
      )}

      {/* Projected Winners Section */}
      {rankings && rankings.rankings.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-6">
            Projected winners
          </h2>

          {/* Logic Calculation */}
          {(() => {
            // 1. Identify Overall Winners (Top 3) by weighted score
            const sortedByScore = [...rankings.rankings].sort(
              (a, b) => b.weightedScore - a.weightedScore,
            );
            const overallWinners = sortedByScore.slice(0, 3);
            const overallWinnerIds = new Set(
              overallWinners.map((r) => r.project.id),
            );

            // 2. Identify Track Winners (Top 1 per Track, excluding Overall)
            const allTracks = Array.from(
              new Set(rankings.rankings.flatMap((r) => r.project.tracks || [])),
            ) as string[];
            const trackWinners: Record<string, Ranking> = {};
            const usedWinnerIds = new Set(overallWinnerIds);

            allTracks.forEach((track) => {
              const projectsInTrack = rankings.rankings.filter((r) =>
                r.project.tracks?.includes(track),
              );

              const sortedTrackProjects = [...projectsInTrack].sort((a, b) => {
                return b.weightedScore - a.weightedScore;
              });

              const candidate = sortedTrackProjects.find(
                (r) => !usedWinnerIds.has(r.project.id),
              );

              if (candidate) {
                trackWinners[track] = candidate;
                usedWinnerIds.add(candidate.project.id);
              }
            });

            return (
              <div className="space-y-8">
                {/* Scoring Method Info */}
                <div className="px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm">
                  <p className="text-xs text-[var(--text-muted)]">
                    Ranked by Bayesian weighted score. Global average{" "}
                    <span className="text-accent font-bold">
                      {rankings.globalAvg}
                    </span>
                    , prior weight C = 2.
                  </p>
                </div>

                {/* Overall Winners */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {overallWinners.map((w, i) => (
                    <LiquidGlass
                      key={w.project.id}
                      className={`p-6 rounded-sm border-t-4 ${
                        i === 0
                          ? "border-yellow-500"
                          : i === 1
                            ? "border-gray-400"
                            : "border-orange-700"
                      }`}
                    >
                      <p className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest mb-2 font-bold">
                        {i === 0
                          ? "Grand prize"
                          : i === 1
                            ? "2nd place"
                            : "3rd place"}
                      </p>
                      <h3 className="text-xl font-black text-[var(--text-primary)] uppercase mb-1">
                        {w.project.name}
                      </h3>
                      <div className="flex items-end gap-3 mb-2">
                        <p className="text-3xl font-black text-accent tabular-nums">
                          {w.weightedScore}
                        </p>
                        <p className="text-sm text-[var(--text-subtle)] tabular-nums mb-1">
                          avg {w.avgScore}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-[var(--text-muted)]">
                          {w.voteCount} judge{w.voteCount !== 1 ? "s" : ""}
                        </p>
                        {confidenceBadge(w.confidenceLevel)}
                      </div>
                    </LiquidGlass>
                  ))}
                </div>

                {/* Track Winners */}
                {Object.keys(trackWinners).length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">
                      Track winners (excluding overall)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(trackWinners).map(([track, w]) => (
                        <div
                          key={track}
                          className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm p-5"
                        >
                          <p className="text-[10px] text-blue-400 uppercase tracking-widest mb-2 font-bold">
                            {track}
                          </p>
                          <h4
                            className="text-lg font-bold text-[var(--text-primary)] mb-1 truncate"
                            title={w.project.name}
                          >
                            {w.project.name}
                          </h4>
                          <div className="flex items-end gap-2">
                            <p className="text-xl font-bold text-[var(--text-muted)] tabular-nums">
                              {w.weightedScore}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <p className="text-[11px] text-[var(--text-muted)]">
                              {w.voteCount} judge{w.voteCount !== 1 ? "s" : ""}
                            </p>
                            {confidenceBadge(w.confidenceLevel)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Rankings Table */}
      <div className="space-y-6">
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2">
              Results
            </p>
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
              Rankings{" "}
              {selectedTrack !== "ALL" && (
                <span className="text-accent">· {selectedTrack}</span>
              )}
            </h2>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {processedRankings.length} projects
          </div>
        </div>

        {!rankings ? (
          <div className="border border-[var(--border-subtle)] rounded-sm p-12 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Loading rankings…
            </p>
          </div>
        ) : processedRankings.length === 0 ? (
          <div className="border border-[var(--border-subtle)] rounded-sm p-12 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              No projects match these filters.
            </p>
          </div>
        ) : (
          <LiquidGlass printed className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                    <th className="px-6 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      Pos
                    </th>
                    <th className="px-4 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      Table
                    </th>
                    <th className="px-4 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      Project
                    </th>
                    <th
                      className="px-4 py-6 text-xs font-bold text-accent uppercase tracking-wider text-right"
                      title="Bayesian Weighted Score"
                    >
                      Weighted
                    </th>
                    <th className="px-4 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-right">
                      Avg
                    </th>

                    {/* Rubric Headers */}
                    <th
                      className="px-3 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-center"
                      title="Creativity"
                    >
                      CRE
                    </th>
                    <th
                      className="px-3 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-center"
                      title="Impact"
                    >
                      IMP
                    </th>
                    <th
                      className="px-3 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-center"
                      title="Scope"
                    >
                      SCP
                    </th>
                    <th
                      className="px-3 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-center"
                      title="Clarity"
                    >
                      CLR
                    </th>
                    <th
                      className="px-3 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-center"
                      title="Soundness"
                    >
                      SND
                    </th>

                    <th className="px-4 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-right">
                      Judges
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {processedRankings.map((r, idx) => {
                    const isExpanded = expandedProject === r.project.id;
                    const isTied = rankings?.ties.some(
                      (t: { projects: { id: string }[] }) =>
                        t.projects.some((p) => p.id === r.project.id),
                    );

                    return (
                      <React.Fragment key={r.project.id}>
                        <tr
                          className={`group cursor-pointer transition-ui duration-300 ${
                            isTied
                              ? "bg-yellow-500/[0.03]"
                              : "hover:bg-[var(--bg-primary)]/40"
                          } ${isExpanded ? "bg-[var(--bg-secondary)]" : ""}`}
                          onClick={() =>
                            setExpandedProject(isExpanded ? null : r.project.id)
                          }
                        >
                          <td className="px-8 py-8">
                            <span
                              className={`text-3xl font-black font-oswald tabular-nums ${
                                idx === 0
                                  ? "text-accent drop-"
                                  : idx < 3
                                    ? "text-[var(--text-primary)]"
                                    : "text-[var(--text-subtle)]"
                              }`}
                            >
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>
                          <td className="px-8 py-8">
                            <div className="space-y-1">
                              <p className="text-sm text-[var(--text-muted)] font-bold">
                                Table {r.project.zone}
                                {r.project.tableNumber}
                              </p>
                              <p className="text-xs text-[var(--text-subtle)] font-mono">
                                ID: {r.project.id.slice(-6).toUpperCase()}
                              </p>
                            </div>
                          </td>
                          <td className="px-8 py-8">
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <p className="text-base font-bold text-[var(--text-primary)] group-hover:text-accent transition-colors">
                                  {r.project.name}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {r.project.tracks?.map((t: string) => (
                                    <span
                                      key={t}
                                      className="px-2 py-0.5 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                  {r.project.challenges?.map((c: string) => (
                                    <span
                                      key={c}
                                      className="px-2 py-0.5 rounded-sm bg-accent/10 border border-accent/30 text-[10px] font-bold text-accent uppercase tracking-widest"
                                    >
                                      {c}
                                    </span>
                                  ))}
                                  {r.project.isCreateX && (
                                    <span className="px-2 py-0.5 rounded-sm bg-yellow-500/10 border border-yellow-500/30 text-[10px] font-bold text-yellow-500 uppercase tracking-widest">
                                      CREATE-X
                                    </span>
                                  )}
                                </div>
                              </div>
                              {r.project.teamMembers && (
                                <p className="text-xs text-[var(--text-muted)]">
                                  {r.project.teamMembers}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-8 text-right">
                            <span
                              className={`text-3xl font-black tabular-nums text-accent`}
                            >
                              {r.displayScore}
                            </span>
                          </td>
                          <td className="px-4 py-8 text-right text-[var(--text-muted)] tabular-nums text-lg">
                            {r.avgScore}
                          </td>

                          <td className="px-3 py-8 text-center text-[var(--text-muted)] tabular-nums text-sm">
                            {r.categoryAvg?.creativity ?? "-"}
                          </td>
                          <td className="px-3 py-8 text-center text-[var(--text-muted)] tabular-nums text-sm">
                            {r.categoryAvg?.impact ?? "-"}
                          </td>
                          <td className="px-3 py-8 text-center text-[var(--text-muted)] tabular-nums text-sm">
                            {r.categoryAvg?.scope ?? "-"}
                          </td>
                          <td className="px-3 py-8 text-center text-[var(--text-muted)] tabular-nums text-sm">
                            {r.categoryAvg?.clarity ?? "-"}
                          </td>
                          <td className="px-3 py-8 text-center text-[var(--text-muted)] tabular-nums text-sm">
                            {r.categoryAvg?.soundness ?? "-"}
                          </td>

                          <td className="px-4 py-8 text-right">
                            <span className="text-[var(--text-subtle)] tabular-nums text-lg">
                              {r.voteCount}
                            </span>
                            <div className="mt-1">
                              {r.confidenceLevel === "LOW" && (
                                <span className="px-2 py-0.5 rounded-sm text-[7px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                  Low
                                </span>
                              )}
                              {r.confidenceLevel === "MEDIUM" && (
                                <span className="px-2 py-0.5 rounded-sm text-[7px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                  Medium
                                </span>
                              )}
                              {r.confidenceLevel === "HIGH" && (
                                <span className="px-2 py-0.5 rounded-sm text-[7px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                                  High
                                </span>
                              )}
                              {r.confidenceLevel === "NONE" && (
                                <span className="px-2 py-0.5 rounded-sm text-[7px] font-bold bg-gray-500/20 text-[var(--text-subtle)] border border-gray-500/30">
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded row with individual votes */}
                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={12}
                              className="px-8 py-8 bg-[var(--bg-primary)]/40 border-t border-[var(--border-subtle)]"
                            >
                              <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">
                                  Votes
                                </p>
                                {r.votes.length === 0 ? (
                                  <p className="text-sm text-[var(--text-muted)]">
                                    No votes for this project yet.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {r.votes.map((v, vi) => (
                                      <div
                                        key={vi}
                                        className="relative bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-5 rounded-sm"
                                      >
                                        <div className="flex items-center justify-between mb-4">
                                          <span className="text-sm font-bold text-[var(--text-primary)]">
                                            {v.judgeName}
                                          </span>
                                          <span className="text-3xl font-black text-accent tabular-nums">
                                            {v.score}
                                          </span>
                                        </div>
                                        {/* Per-category breakdown */}
                                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3 mb-3">
                                          {[
                                            {
                                              label: "CRE",
                                              value: v.scoreCreativity,
                                            },
                                            {
                                              label: "IMP",
                                              value: v.scoreImpact,
                                            },
                                            {
                                              label: "SCP",
                                              value: v.scoreScope,
                                            },
                                            {
                                              label: "CLR",
                                              value: v.scoreClarity,
                                            },
                                            {
                                              label: "SND",
                                              value: v.scoreSoundness,
                                            },
                                          ].map((cat) => (
                                            <div
                                              key={cat.label}
                                              className="rounded-sm px-2 py-1.5 text-center bg-[var(--bg-secondary)]"
                                            >
                                              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">
                                                {cat.label}
                                              </p>
                                              <p className="text-sm font-bold tabular-nums mt-0.5 text-[var(--text-primary)]">
                                                {cat.value ?? "-"}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                        {v.durationSeconds != null &&
                                          v.durationSeconds > 300 && (
                                            <div className="flex items-center gap-2 mt-2">
                                              <span className="px-2 py-0.5 rounded-sm text-[8px] font-black bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-widest">
                                                Overtime{" "}
                                                {Math.floor(
                                                  v.durationSeconds / 60,
                                                )}
                                                :
                                                {String(
                                                  v.durationSeconds % 60,
                                                ).padStart(2, "0")}
                                              </span>
                                            </div>
                                          )}
                                        {v.comment && (
                                          <p className="text-[var(--text-muted)] text-sm mt-2 leading-relaxed">
                                            &ldquo;{v.comment}&rdquo;
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </LiquidGlass>
        )}
      </div>

      {/* Judge Roster Section */}
      <div className="mt-16 space-y-6">
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2">
              Judges
            </p>
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
              Judge roster
            </h2>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {judges?.filter((j) => j.isActive).length || 0} active
          </div>
        </div>

        <LiquidGlass printed className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                  <th className="px-8 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Judge
                  </th>
                  <th className="px-8 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-8 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Assigned tracks
                  </th>
                  <th className="px-8 py-6 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {judges?.map((j) => (
                  <tr
                    key={j.id}
                    className="hover:bg-[var(--bg-primary)]/40 transition-colors duration-300"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        {}
                        <img
                          src={
                            j.user?.image ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(j.name || "J")}`
                          }
                          alt={j.name || ""}
                          className="w-10 h-10 rounded-sm border border-[var(--border-subtle)] ring-1 ring-accent/20"
                        />
                        <div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">
                            {j.name}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                            {j.specialty || "Generalist"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs text-[var(--text-muted)]">
                        {j.user?.email}
                      </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {j.assignments
                          .filter((a) => a.hackathonId === selectedHackathon)
                          .map((a, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2.5 py-1 rounded-sm bg-accent/10 border border-accent/25 text-[11px] font-bold text-accent uppercase tracking-wider"
                            >
                              {a.track || "Unassigned"}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <span
                        className={`px-3 py-1 rounded-sm text-[8px] font-black uppercase tracking-widest ${
                          j.isActive
                            ? "bg-green-500/10 text-green-500 border border-green-500/20"
                            : "bg-red-500/10 text-red-500 border border-red-500/20"
                        }`}
                      >
                        {j.isActive ? "Active" : "Offline"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!judges?.length && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-8 py-12 text-center text-sm text-[var(--text-muted)]"
                    >
                      No judges have registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </LiquidGlass>
      </div>

      {/* Global Stats */}
      {rankings && rankings.rankings.length > 0 && (
        <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-6">
          <LiquidGlass printed className="rounded-sm p-8 text-center">
            <p className="text-4xl font-black text-[var(--text-primary)] tabular-nums">
              {rankings.rankings.length}
            </p>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">
              Projects
            </p>
          </LiquidGlass>
          <LiquidGlass printed className="rounded-sm p-8 text-center">
            <p className="text-4xl font-black text-accent tabular-nums">
              {rankings.rankings.reduce(
                (sum: number, r: { voteCount: number }) => sum + r.voteCount,
                0,
              )}
            </p>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">
              Votes
            </p>
          </LiquidGlass>
          <LiquidGlass printed className="rounded-sm p-8 text-center">
            <p className="text-4xl font-black text-accent tabular-nums">
              {rankings.globalAvg}
            </p>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">
              Global avg score
            </p>
          </LiquidGlass>
          <LiquidGlass printed className="rounded-sm p-8 text-center">
            <p
              className={`text-4xl font-black tabular-nums ${rankings.ties.length > 0 ? "text-yellow-500" : "text-[var(--text-subtle)]"}`}
            >
              {rankings.ties.length}
            </p>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">
              Ties
            </p>
          </LiquidGlass>
        </div>
      )}
    </>
  );
}
