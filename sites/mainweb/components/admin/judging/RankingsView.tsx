"use client";

import React, { useState } from "react";
import {
  body,
  btnSecondary,
  itemTitle,
  label,
  meta,
  sectionTitle,
  status,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

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

const rubric = [
  { key: "creativity", label: "Creativity" },
  { key: "impact", label: "Impact" },
  { key: "scope", label: "Scope" },
  { key: "clarity", label: "Clarity" },
  { key: "soundness", label: "Soundness" },
] as const;

const confidence: Record<string, { tone: Tone; text: string }> = {
  HIGH: { tone: "success", text: "High" },
  MEDIUM: { tone: "neutral", text: "Medium" },
  LOW: { tone: "warning", text: "Low" },
  NONE: { tone: "neutral", text: "None" },
};

const th = "py-3 px-4 text-[13px] font-medium text-[var(--text-subtle)]";
const statValue =
  "mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums";

export function RankingsView({
  rankings,
  processedRankings,
  selectedTrack,
  judges,
  selectedHackathon,
}: RankingsViewProps) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const confidenceBadge = (level: string) => {
    const c = confidence[level] ?? confidence.NONE;
    return <span className={status(c.tone)}>{c.text}</span>;
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
            className={btnSecondary}
          >
            Download results CSV
          </button>
        </div>
      )}
      {/* Tie Warning — Overall */}
      {rankings?.hasTies && (
        <section className="mb-12 border-t border-[var(--border-subtle)] pt-6">
          <p className={status("warning")}>Tied scores</p>
          <p className={`mt-1 ${body}`}>
            Break these ties by hand before announcing winners.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
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
                <div key={i}>
                  <p className={`${meta} tabular-nums mb-1`}>
                    Weighted score {tie.score}
                  </p>
                  <div className="space-y-0.5">
                    {tie.projects.map((p) => (
                      <p
                        key={p.id}
                        className="text-[var(--text-primary)] text-[15px]"
                      >
                        {p.name}{" "}
                        <span className="text-[var(--text-subtle)] tabular-nums">
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
        </section>
      )}

      {/* Projected Winners Section */}
      {rankings && rankings.rankings.length > 0 && (
        <section className="mb-12">
          <h2 className={sectionTitle}>Projected winners</h2>

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
              <div className="mt-2 space-y-8">
                {/* Scoring Method Info */}
                <p className={meta}>
                  Ranked by Bayesian weighted score. Global average{" "}
                  <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                    {rankings.globalAvg}
                  </span>
                  , prior weight C = 2.
                </p>

                {/* Overall Winners */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                  {overallWinners.map((w, i) => (
                    <div
                      key={w.project.id}
                      className={`pt-4 ${
                        i === 0
                          ? "border-t-2 border-[var(--text-primary)]"
                          : "border-t border-[var(--border-subtle)]"
                      }`}
                    >
                      <p className={label}>
                        {i === 0
                          ? "Grand prize"
                          : i === 1
                            ? "2nd place"
                            : "3rd place"}
                      </p>
                      <h3 className={`mt-1 ${itemTitle}`}>{w.project.name}</h3>
                      <div className="flex items-baseline gap-3 mt-2">
                        <p
                          className={`font-[family-name:var(--font-display)] text-[40px] font-semibold leading-none tabular-nums ${
                            i === 0
                              ? "text-accent"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {w.weightedScore}
                        </p>
                        <p className={`${meta} tabular-nums`}>
                          avg {w.avgScore}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <p className={meta}>
                          {w.voteCount} judge{w.voteCount !== 1 ? "s" : ""}
                        </p>
                        {confidenceBadge(w.confidenceLevel)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Track Winners */}
                {Object.keys(trackWinners).length > 0 && (
                  <div>
                    <h3 className={`${label} mb-3`}>
                      Track winners (excluding overall)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5">
                      {Object.entries(trackWinners).map(([track, w]) => (
                        <div
                          key={track}
                          className="min-w-0 border-t border-[var(--border-subtle)] pt-3"
                        >
                          <p className={meta}>{track}</p>
                          <h4
                            className="mt-0.5 text-[15px] font-semibold text-[var(--text-primary)] truncate"
                            title={w.project.name}
                          >
                            {w.project.name}
                          </h4>
                          <p className="mt-1 font-[family-name:var(--font-display)] text-[24px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                            {w.weightedScore}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            <p className={meta}>
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
        </section>
      )}

      {/* Rankings Table */}
      <section>
        <div className="flex justify-between items-baseline gap-4 mb-4">
          <h2 className={sectionTitle}>
            Rankings
            {selectedTrack !== "ALL" && (
              <span className="text-[var(--text-subtle)]">
                {" "}
                · {selectedTrack}
              </span>
            )}
          </h2>
          <p className={`${meta} tabular-nums shrink-0`}>
            {processedRankings.length} projects
          </p>
        </div>

        {!rankings ? (
          <p className={`border-t border-[var(--border-subtle)] py-12 ${body}`}>
            Loading rankings…
          </p>
        ) : processedRankings.length === 0 ? (
          <p className={`border-t border-[var(--border-subtle)] py-12 ${body}`}>
            No projects match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className={`${th} pl-0`}>Rank</th>
                  <th className={th}>Table</th>
                  <th className={th}>Project</th>
                  <th
                    className={`${th} text-right text-[var(--text-primary)]`}
                    title="Bayesian Weighted Score"
                  >
                    Weighted
                  </th>
                  <th className={`${th} text-right`}>Avg</th>

                  {/* Rubric Headers */}
                  {rubric.map((c) => (
                    <th key={c.key} className={`${th} text-right`}>
                      {c.label}
                    </th>
                  ))}

                  <th className={`${th} text-right`}>Judges</th>
                </tr>
              </thead>
              <tbody>
                {processedRankings.map((r, idx) => {
                  const isExpanded = expandedProject === r.project.id;
                  const isTied = rankings?.ties.some(
                    (t: { projects: { id: string }[] }) =>
                      t.projects.some((p) => p.id === r.project.id),
                  );
                  const tags = [
                    ...(r.project.tracks ?? []),
                    ...(r.project.challenges ?? []),
                    ...(r.project.isCreateX ? ["CREATE-X"] : []),
                  ];

                  return (
                    <React.Fragment key={r.project.id}>
                      <tr
                        className={`cursor-pointer border-b border-[var(--border-subtle)] transition-colors ${
                          isExpanded
                            ? "bg-[var(--bg-secondary)]"
                            : isTied
                              ? "bg-[var(--warning-glow)]"
                              : "hover:bg-[var(--bg-secondary)]"
                        }`}
                        onClick={() =>
                          setExpandedProject(isExpanded ? null : r.project.id)
                        }
                      >
                        <td className="py-4 pr-4 align-top">
                          <span
                            className={`font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tabular-nums ${
                              idx === 0
                                ? "text-accent"
                                : idx < 3
                                  ? "text-[var(--text-primary)]"
                                  : "text-[var(--text-subtle)]"
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-4 px-4 align-top whitespace-nowrap">
                          <p className="text-[14px] font-semibold text-[var(--text-primary)] tabular-nums">
                            Table {r.project.zone}
                            {r.project.tableNumber}
                          </p>
                          <p className="text-[12px] text-[var(--text-subtle)] font-mono">
                            {r.project.id.slice(-6).toUpperCase()}
                          </p>
                        </td>
                        <td className="py-4 px-4 align-top min-w-[220px]">
                          <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                            {r.project.name}
                          </p>
                          {tags.length > 0 && (
                            <p className={meta}>{tags.join(" · ")}</p>
                          )}
                          {r.project.teamMembers && (
                            <p className="text-[13px] text-[var(--text-muted)]">
                              {r.project.teamMembers}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-4 align-top text-right">
                          <span className="font-[family-name:var(--font-display)] text-[24px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                            {r.displayScore}
                          </span>
                        </td>
                        <td className="py-4 px-4 align-top text-right text-[15px] text-[var(--text-muted)] tabular-nums">
                          {r.avgScore}
                        </td>

                        {rubric.map((c) => (
                          <td
                            key={c.key}
                            className="py-4 px-4 align-top text-right text-[14px] text-[var(--text-muted)] tabular-nums"
                          >
                            {r.categoryAvg?.[c.key] ?? "-"}
                          </td>
                        ))}

                        <td className="py-4 pl-4 align-top text-right">
                          <p className="text-[15px] text-[var(--text-primary)] tabular-nums">
                            {r.voteCount}
                          </p>
                          <div className="mt-1 whitespace-nowrap">
                            {confidenceBadge(r.confidenceLevel)}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row with individual votes */}
                      {isExpanded && (
                        <tr className="border-b border-[var(--border-subtle)]">
                          <td colSpan={12} className="py-6 md:pl-12">
                            <p className={`${label} mb-3`}>Votes</p>
                            {r.votes.length === 0 ? (
                              <p className={body}>
                                No votes for this project yet.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                                {r.votes.map((v, vi) => (
                                  <div
                                    key={vi}
                                    className="border-t border-[var(--border-subtle)] py-4"
                                  >
                                    <div className="flex items-baseline justify-between gap-4">
                                      <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                                        {v.judgeName}
                                      </span>
                                      <span className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                                        {v.score}
                                      </span>
                                    </div>
                                    {/* Per-category breakdown */}
                                    <dl className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
                                      {[
                                        {
                                          label: "Creativity",
                                          value: v.scoreCreativity,
                                        },
                                        {
                                          label: "Impact",
                                          value: v.scoreImpact,
                                        },
                                        {
                                          label: "Scope",
                                          value: v.scoreScope,
                                        },
                                        {
                                          label: "Clarity",
                                          value: v.scoreClarity,
                                        },
                                        {
                                          label: "Soundness",
                                          value: v.scoreSoundness,
                                        },
                                      ].map((cat) => (
                                        <div
                                          key={cat.label}
                                          className="flex items-baseline gap-1.5"
                                        >
                                          <dt className={meta}>{cat.label}</dt>
                                          <dd className="text-[14px] font-semibold tabular-nums text-[var(--text-primary)]">
                                            {cat.value ?? "-"}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                    {v.durationSeconds != null &&
                                      v.durationSeconds > 300 && (
                                        <p
                                          className={`mt-2 ${status("danger")}`}
                                        >
                                          Overtime{" "}
                                          {Math.floor(v.durationSeconds / 60)}:
                                          {String(
                                            v.durationSeconds % 60,
                                          ).padStart(2, "0")}
                                        </p>
                                      )}
                                    {v.comment && (
                                      <p className={`mt-2 ${body}`}>
                                        &ldquo;{v.comment}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Judge Roster Section */}
      <section className="mt-16">
        <div className="flex justify-between items-baseline gap-4 mb-4">
          <h2 className={sectionTitle}>Judge roster</h2>
          <p className={`${meta} tabular-nums shrink-0`}>
            {judges?.filter((j) => j.isActive).length || 0} active
          </p>
        </div>

        <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className={`${th} pl-0`}>Judge</th>
                <th className={th}>Contact</th>
                <th className={th}>Assigned tracks</th>
                <th className={`${th} pr-0 text-right`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {judges?.map((j) => (
                <tr
                  key={j.id}
                  className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      {}
                      <img
                        src={
                          j.user?.image ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(j.name || "J")}`
                        }
                        alt={j.name || ""}
                        className="w-8 h-8 rounded-full border border-[var(--border-subtle)]"
                      />
                      <div>
                        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                          {j.name}
                        </p>
                        <p className={meta}>{j.specialty || "Generalist"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[14px] text-[var(--text-muted)]">
                    {j.user?.email}
                  </td>
                  <td className="py-3 px-4 text-[14px] text-[var(--text-muted)]">
                    {j.assignments
                      .filter((a) => a.hackathonId === selectedHackathon)
                      .map((a) => a.track || "Unassigned")
                      .join(", ")}
                  </td>
                  <td className="py-3 pl-4 text-right whitespace-nowrap">
                    <span
                      className={status(j.isActive ? "success" : "neutral")}
                    >
                      {j.isActive ? "Active" : "Offline"}
                    </span>
                  </td>
                </tr>
              ))}
              {!judges?.length && (
                <tr>
                  <td colSpan={4} className={`py-12 ${body}`}>
                    No judges have registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Global Stats */}
      {rankings && rankings.rankings.length > 0 && (
        <dl className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 border-t border-[var(--border-subtle)] pt-6">
          <div>
            <dt className={label}>Projects</dt>
            <dd className={`${statValue} text-[var(--text-primary)]`}>
              {rankings.rankings.length}
            </dd>
          </div>
          <div>
            <dt className={label}>Votes</dt>
            <dd className={`${statValue} text-[var(--text-primary)]`}>
              {rankings.rankings.reduce(
                (sum: number, r: { voteCount: number }) => sum + r.voteCount,
                0,
              )}
            </dd>
          </div>
          <div>
            <dt className={label}>Global avg score</dt>
            <dd className={`${statValue} text-[var(--text-primary)]`}>
              {rankings.globalAvg}
            </dd>
          </div>
          <div>
            <dt className={label}>Ties</dt>
            <dd
              className={`${statValue} ${rankings.ties.length > 0 ? "text-[var(--warning)]" : "text-[var(--text-subtle)]"}`}
            >
              {rankings.ties.length}
            </dd>
          </div>
        </dl>
      )}
    </>
  );
}
