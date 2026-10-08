import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { readLiveHackathons, refreshDbGauges, registry } from "./metrics";

const rules = readFileSync(
  fileURLToPath(
    new URL("../../../../monitoring/rules/hackathon.yml", import.meta.url),
  ),
  "utf-8",
);

type GaugeReading = {
  values: { value: number; labels: Record<string, string> }[];
};

/** Drizzle conditions point back at their tables, so this only follows SQL text. */
function sqlText(condition: unknown) {
  const parts: string[] = [];
  const visit = (value: unknown, seen: Set<unknown>) => {
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, seen);
      return;
    }
    const record = value as { value?: unknown; queryChunks?: unknown };
    if ("value" in record) visit(record.value, seen);
    if ("queryChunks" in record) visit(record.queryChunks, seen);
  };
  visit(condition, new Set());
  return parts.join(" ");
}

function readings(name: string) {
  return registry.getSingleMetric(name) as {
    get: () => Promise<GaugeReading> | GaugeReading;
    set: (labels: Record<string, string>, value: number) => void;
  };
}

describe("hackathon gauges", () => {
  it("counts a live edition and drops one that is no longer live", async () => {
    readings("dsgt_hackathon_projects").set(
      { edition: "Hacklytics 2026", phase: "completed" },
      40,
    );

    const queries: string[] = [];
    const rowsFor = (table: string) => {
      if (table === "hackathon") {
        return [
          {
            id: "hack_1",
            edition: "Hacklytics 2027",
            phase: "in_progress",
            judgingActive: true,
          },
        ];
      }
      if (table === "hackathon_participant") {
        return [
          { hackathonId: "hack_1", status: "approved", total: 12 },
          { hackathonId: "hack_1", status: "checked_in", total: 3 },
        ];
      }
      if (table === "hackathon_project") {
        return [{ hackathonId: "hack_1", total: 4 }];
      }
      if (table === "hackathon_event_attendee") {
        return [{ hackathonId: "hack_1", total: 9 }];
      }
      if (table === "judging_project") {
        return [{ hackathonId: "hack_1", total: 4 }];
      }
      return [];
    };

    const db = {
      select() {
        return {
          from(table: Parameters<typeof getTableName>[0]) {
            const pending: any = Promise.resolve(rowsFor(getTableName(table)));
            pending.from = () => pending;
            pending.innerJoin = () => pending;
            pending.groupBy = () => pending;
            pending.where = (condition: unknown) => {
              queries.push(sqlText(condition));
              return pending;
            };
            return pending;
          },
        };
      },
      execute: async (query: unknown) => {
        const text = JSON.stringify(query);
        if (text.includes("member_resume")) {
          return { rows: [{ files: "1", bytes: "10" }] };
        }
        if (text.includes("metadata")) {
          return { rows: [{ plan: "annual", total: "2" }] };
        }
        return {
          rows: [{ active: "5", lapsed: "1", bootcamp: "2", unlinked: "0" }],
        };
      },
    };

    const live = await readLiveHackathons(db as unknown as DrizzleDB);
    expect(live).toEqual([
      {
        edition: "Hacklytics 2027",
        phase: "in_progress",
        judgingActive: true,
        projects: 4,
        checkinsToday: 9,
        judgingProjects: 4,
        votes: 0,
        participants: {
          pending: 0,
          approved: 12,
          rejected: 0,
          waitlisted: 0,
          checked_in: 3,
        },
      },
    ]);

    await refreshDbGauges(db as unknown as DrizzleDB);

    const projects = (await readings("dsgt_hackathon_projects").get()).values;
    expect(projects).toEqual([
      {
        labels: { edition: "Hacklytics 2027", phase: "in_progress" },
        value: 4,
      },
    ]);

    const participants = (await readings("dsgt_hackathon_participants").get())
      .values;
    expect(
      participants.find((row) => row.labels.status === "checked_in")?.value,
    ).toBe(3);
    expect(
      participants.find((row) => row.labels.status === "pending")?.value,
    ).toBe(0);
    expect(
      participants.find((row) => row.labels.edition === "Hacklytics 2026"),
    ).toBeUndefined();

    expect(
      (await readings("dsgt_hackathon_checkins_today").get()).values[0]?.value,
    ).toBe(9);
    expect(
      (await readings("dsgt_hackathon_votes").get()).values[0]?.value,
    ).toBe(0);
    expect(
      (await readings("dsgt_hackathon_judging_active").get()).values[0]?.value,
    ).toBe(1);

    const filters = queries.join("\n");
    expect(filters).toContain("in_progress");
    expect(filters).toContain("draft");
    expect(filters).toContain("is null");
    expect(filters).not.toContain("completed");
  });

  it("alerts when judging is on, tables are assigned, and no scores exist", () => {
    expect(rules).toContain("alert: HackathonJudgingIdle");
    expect(rules).toContain("dsgt_hackathon_judging_active");
    expect(rules).toContain("dsgt_hackathon_judging_projects");
    expect(rules).toContain("dsgt_hackathon_votes");
    expect(rules).toContain("for: 30m");
  });
});
