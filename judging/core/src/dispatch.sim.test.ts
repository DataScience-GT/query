import { describe, expect, it } from "vitest";
import { pickNext } from "./dispatch";
import type { Candidate, DispatchStrategy } from "./dispatch";
import { DEFAULT_TIMERS } from "./timers";
import { scoreUncertainty } from "./uncertainty";

/**
 * Twenty judges, two hundred projects, three hours at the table. The same
 * noise is available to both strategies; only the choice of who is seen
 * again changes. The ten truly strongest projects should end up in an order
 * closer to the truth when extra looks go to the unsettled ones.
 */
describe("uncertainty dispatch", () => {
  it("ranks the true top 10 better than even coverage at the same number of looks", () => {
    const projects = 200;
    const judges = 20;
    const hours = 3;
    const budget = judges * Math.floor((hours * 3600) / DEFAULT_TIMERS.targetSeconds);
    const truth = Array.from({ length: projects }, (_, index) => index);
    const noise = truth.map((_, project) =>
      Array.from({ length: 40 }, (_, look) =>
        gaussian(mulberry32(project * 1000 + look + 1)) * noiseScale(project),
      ),
    );

    const coverage = simulate("coverage", { projects, judges, budget, truth, noise });
    const uncertainty = simulate("uncertainty", { projects, judges, budget, truth, noise });
    const top = truth.map((_, index) => index).slice(-10);

    expect(kendall(top, uncertainty, truth)).toBeGreaterThan(kendall(top, coverage, truth));
  });
});

function noiseScale(project: number): number {
  return project >= 185 ? 18 : 3;
}

function simulate(
  strategy: DispatchStrategy,
  input: {
    projects: number;
    judges: number;
    budget: number;
    truth: number[];
    noise: number[][];
  },
): number[] {
  const scores = Array.from({ length: input.projects }, () => [] as number[]);
  const seen = Array.from({ length: input.judges }, () => new Set<number>());
  const last: (number | null)[] = Array.from({ length: input.judges }, () => null);
  let used = 0;
  let guard = 0;
  while (used < input.budget && guard < input.budget) {
    for (let judge = 0; judge < input.judges && used < input.budget; judge += 1) {
      const candidates: Candidate[] = [];
      for (let project = 0; project < input.projects; project += 1) {
        if (seen[judge]?.has(project)) continue;
        candidates.push({
          id: String(project),
          tableNumber: project,
          coverage: scores[project]?.length ?? 0,
          claimedAt: null,
          uncertainty: scoreUncertainty(scores[project] ?? []),
        });
      }
      const pick = pickNext(
        candidates,
        { lastTable: last[judge] ?? null },
        { strategy, minLooksPerProject: 2 },
        () => 0,
      );
      if (!pick) continue;
      const project = Number(pick.id);
      const look = scores[project]?.length ?? 0;
      scores[project]?.push((input.truth[project] ?? 0) + (input.noise[project]?.[look] ?? 0));
      seen[judge]?.add(project);
      last[judge] = project;
      used += 1;
    }
    guard += 1;
  }
  return scores.map((row, index) =>
    row.length === 0
      ? (input.truth[index] ?? 0)
      : row.reduce((sum, value) => sum + value, 0) / row.length,
  );
}

function kendall(ids: number[], estimate: number[], truth: number[]): number {
  let concordant = 0;
  let discordant = 0;
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      const a = ids[left] ?? 0;
      const b = ids[right] ?? 0;
      const truthSign = Math.sign((truth[a] ?? 0) - (truth[b] ?? 0));
      const estimateSign = Math.sign((estimate[a] ?? 0) - (estimate[b] ?? 0));
      if (truthSign === 0 || estimateSign === 0) continue;
      if (truthSign === estimateSign) concordant += 1;
      else discordant += 1;
    }
  }
  return (concordant - discordant) / (concordant + discordant);
}

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
