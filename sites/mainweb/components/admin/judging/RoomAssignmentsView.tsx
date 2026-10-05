"use client";

import React from "react";
import { meta, sectionTitle, status } from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

type Project = {
  id: string;
  name: string;
  tableNumber: number;
  zone: string | null;
  teamMembers?: string | null;
  tracks?: string[] | null;
  challenges?: string[] | null;
  isCreateX?: boolean | null;
};

type Ranking = {
  project: Project;
  voteCount: number;
  avgScore: number;
  weightedScore: number;
  confidenceLevel: string;
};

type RankingsData = {
  rankings: Ranking[];
};

type RoomAssignmentsViewProps = {
  rankings: RankingsData | null;
};

const confidence: Record<string, { tone: Tone; text: string }> = {
  HIGH: { tone: "success", text: "High" },
  MEDIUM: { tone: "neutral", text: "Medium" },
  LOW: { tone: "warning", text: "Low" },
  NONE: { tone: "neutral", text: "None" },
};

const th = "py-3 px-4 text-[13px] font-medium text-[var(--text-subtle)]";
const td = "py-3 px-4 text-[14px]";

export function RoomAssignmentsView({ rankings }: RoomAssignmentsViewProps) {
  if (!rankings) return null;

  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className={sectionTitle}>Room assignments</h2>
        <p className={`mt-1 ${meta}`}>
          {rankings.rankings.length} projects assigned
        </p>
      </div>
      <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`${th} text-left`}>Table</th>
              <th className={`${th} text-left`}>Project</th>
              <th className={`${th} text-left`}>Team</th>
              <th className={`${th} text-left`}>Main track</th>
              <th className={`${th} text-left`}>Extra tracks</th>
              <th className={`${th} text-right`}>Votes</th>
              <th className={`${th} text-right`}>Avg score</th>
              <th className={`${th} text-right`}>Weighted</th>
              <th className={`${th} text-left`}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {[...rankings.rankings]
              .sort(
                (a, b) =>
                  (a.project.tableNumber || 0) - (b.project.tableNumber || 0),
              )
              .map((r) => {
                const extras = (r.project.tracks?.slice(1) || [])
                  .concat(r.project.challenges || [])
                  .concat(r.project.isCreateX ? ["CREATE-X"] : []);
                const conf = confidence[r.confidenceLevel] ?? {
                  tone: "neutral" as Tone,
                  text: r.confidenceLevel,
                };
                return (
                  <tr
                    key={r.project.id}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className={`${td} font-semibold text-[var(--text-primary)] tabular-nums`}>
                      {r.project.zone || ""}
                      {r.project.tableNumber || "?"}
                    </td>
                    <td className={`${td} font-semibold text-[var(--text-primary)]`}>
                      {r.project.name}
                    </td>
                    <td className={`${td} text-[var(--text-muted)]`}>
                      {r.project.teamMembers || "-"}
                    </td>
                    <td className={`${td} text-[var(--text-muted)]`}>
                      {r.project.tracks?.[0] || (
                        <span className="text-[var(--text-subtle)]">-</span>
                      )}
                    </td>
                    <td className={`${td} text-[var(--text-muted)]`}>
                      {extras.length > 0 ? (
                        extras.join(", ")
                      ) : (
                        <span className="text-[var(--text-subtle)]">-</span>
                      )}
                    </td>
                    <td className={`${td} text-right tabular-nums text-[var(--text-muted)]`}>
                      {r.voteCount}
                    </td>
                    <td className={`${td} text-right tabular-nums text-[var(--text-primary)]`}>
                      {r.avgScore}
                      <span className="text-[var(--text-subtle)] ml-0.5">/50</span>
                    </td>
                    <td className={`${td} text-right tabular-nums font-semibold text-[var(--text-primary)]`}>
                      {r.weightedScore}
                    </td>
                    <td className={td}>
                      <span className={status(conf.tone)}>{conf.text}</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
