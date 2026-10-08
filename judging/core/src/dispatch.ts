import { distance } from "./distance";
import type { TablePoint } from "./distance";

export type Candidate = {
  id: string;
  tableNumber: number;
  zoneId?: string | null;
  x?: number | null;
  y?: number | null;
  /** Scores plus live claims from judges in the same group. */
  coverage: number;
  /** Most recent live claim by another judge, if any (ms epoch). */
  claimedAt: number | null;
  /** Used by the uncertainty strategy once every project has its minimum looks. */
  uncertainty?: number;
};

export type JudgeSpot = {
  lastTable: number | null;
  zoneId?: string | null;
  x?: number | null;
  y?: number | null;
};

export type DispatchStrategy = "coverage" | "uncertainty";

export type DispatchConfig = {
  strategy: DispatchStrategy;
  /** Uncertainty waits until every candidate has at least this many looks. */
  minLooksPerProject: number;
};

/**
 * The next project for one judge, from the projects they are eligible for
 * and have not had.
 *
 * Coverage: fewest looks, then the nearest table, then `random`. A table
 * someone is already at is passed over while any other exists. When every
 * remaining one is taken, the one claimed longest ago, because an idle
 * judge is worse than two at a table.
 *
 * Uncertainty: the same coverage rule until `minLooksPerProject` is met
 * everywhere in `candidates`, then the highest uncertainty, then nearest.
 */
export function pickNext(
  candidates: readonly Candidate[],
  judge: JudgeSpot,
  config: DispatchConfig,
  random: (n: number) => number,
): Candidate | null {
  if (candidates.length === 0) return null;

  const free = candidates.filter((candidate) => candidate.claimedAt === null);
  if (free.length === 0) return oldestClaim(candidates);

  const stillCovering =
    config.strategy === "coverage" ||
    candidates.some(
      (candidate) => candidate.coverage < config.minLooksPerProject,
    );

  const tier = stillCovering ? fewestLooks(free) : highestUncertainty(free);
  return narrow(tier, judge, random);
}

function fewestLooks(free: readonly Candidate[]): Candidate[] {
  const fewest = Math.min(...free.map((candidate) => candidate.coverage));
  return free.filter((candidate) => candidate.coverage === fewest);
}

function highestUncertainty(free: readonly Candidate[]): Candidate[] {
  const highest = Math.max(
    ...free.map((candidate) => candidate.uncertainty ?? 0),
  );
  return free.filter(
    (candidate) => (candidate.uncertainty ?? 0) === highest,
  );
}

function oldestClaim(candidates: readonly Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (!best || (candidate.claimedAt ?? 0) < (best.claimedAt ?? 0)) {
      best = candidate;
    }
  }
  return best;
}

function narrow(
  tier: readonly Candidate[],
  judge: JudgeSpot,
  random: (n: number) => number,
): Candidate | null {
  if (tier.length === 0) return null;
  if (judge.lastTable === null) return choose(tier, random);

  const here: TablePoint = {
    number: judge.lastTable,
    zoneId: judge.zoneId ?? null,
    x: judge.x ?? null,
    y: judge.y ?? null,
  };
  const nearest = Math.min(
    ...tier.map((candidate) => distance(here, candidatePoint(candidate))),
  );
  const closest = tier.filter(
    (candidate) => distance(here, candidatePoint(candidate)) === nearest,
  );
  return choose(closest, random);
}

function choose(
  tier: readonly Candidate[],
  random: (n: number) => number,
): Candidate | null {
  if (tier.length === 0) return null;
  return tier[random(tier.length)] ?? null;
}

function candidatePoint(candidate: Candidate): TablePoint {
  return {
    number: candidate.tableNumber,
    zoneId: candidate.zoneId ?? null,
    x: candidate.x ?? null,
    y: candidate.y ?? null,
  };
}
