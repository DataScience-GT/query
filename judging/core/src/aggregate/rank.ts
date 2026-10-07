import type { Comparison } from "../comparison";
import { bayesianShrink, round2 } from "./bayes";
import { bradleyTerry } from "./bradleyTerry";
import { blend } from "./blend";
import { zNormalize } from "./zscore";

export type VoteInput = {
  judgeId: string;
  projectId: string;
  judgeGroup: string;
  total: number;
  isCalibration?: boolean;
};

export type RankComparison = Comparison & {
  judgeId: string;
  judgeGroup: string;
};

export type ProjectInput = {
  id: string;
  trackIds: readonly string[];
};

export type RankConfig = {
  bayesianC: number;
  pairwiseWeight: number;
  /** How much a calibration vote counts, relative to a normal vote of 1. */
  calibrationWeight: number;
};

export type RankedRow = {
  projectId: string;
  trackId: string;
  judgeGroup: string;
  placement: number | null;
  score: number;
  rubricComponent: number;
  pairwiseComponent: number;
  voteCount: number;
  comparisonCount: number;
};

/**
 * Rank each track and judge group.
 *
 * Rubric side, at `pairwiseWeight = 0` and `calibrationWeight = 1`: z-score
 * each judge onto the group's mean and spread, average per project (rounded
 * to hundredths), shrink toward the mean of those averages with `bayesianC`,
 * round again, and place by that score. That is the pipeline the existing
 * event uses, so a replay of its votes lands on the same numbers.
 *
 * Pairwise side: Bradley-Terry on comparisons in the group, scaled onto the
 * rubric scores, then blended. Weight 0 leaves the rubric number untouched.
 * A calibration vote is down-weighted in the average and in the shrink's
 * sample size. It still informs that judge's own z-score.
 */
export function rank(
  projects: readonly ProjectInput[],
  votes: readonly VoteInput[],
  comparisons: readonly RankComparison[],
  config: RankConfig,
): RankedRow[] {
  const known = new Set(projects.map((project) => project.id));
  const tracks = trackOrder(projects);
  const groups = groupOrder(votes, comparisons);
  const rows: RankedRow[] = [];

  for (const judgeGroup of groups) {
    const groupVotes = votes.filter(
      (vote) => vote.judgeGroup === judgeGroup && known.has(vote.projectId),
    );
    const normalized = normalize(groupVotes, config);
    for (const trackId of tracks) {
      const onTrack = projects.filter((project) =>
        project.trackIds.includes(trackId),
      );
      const onTrackIds = new Set(onTrack.map((project) => project.id));
      const trackVotes = groupVotes
        .map((vote, index) => ({
          vote,
          normalized: normalized[index] ?? 0,
        }))
        .filter(({ vote }) => onTrackIds.has(vote.projectId));
      const trackComparisons = comparisons.filter(
        (comparison) =>
          comparison.judgeGroup === judgeGroup &&
          onTrackIds.has(comparison.a) &&
          onTrackIds.has(comparison.b),
      );
      rows.push(
        ...rankTrack(
          onTrack,
          trackVotes,
          trackComparisons,
          trackId,
          judgeGroup,
          config,
        ),
      );
    }
  }

  return rows;
}

function weightOf(vote: VoteInput, config: RankConfig): number {
  return vote.isCalibration ? config.calibrationWeight : 1;
}

function spread(scores: readonly number[]): { mean: number; std: number } {
  if (scores.length === 0) return { mean: 0, std: 1 };
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance =
    scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length;
  return { mean, std: Math.sqrt(variance) || 1 };
}

function normalize(
  votes: readonly VoteInput[],
  config: RankConfig,
): number[] {
  const weights = votes.map((vote) => weightOf(vote, config));
  const raw: number[] = [];
  for (let index = 0; index < votes.length; index += 1) {
    const vote = votes[index];
    if (vote && (weights[index] ?? 0) > 0) raw.push(vote.total);
  }
  const { mean, std } = spread(raw);

  const byJudge = new Map<string, number[]>();
  votes.forEach((vote, index) => {
    if ((weights[index] ?? 0) <= 0) return;
    const list = byJudge.get(vote.judgeId) ?? [];
    list.push(index);
    byJudge.set(vote.judgeId, list);
  });

  const out = votes.map(() => 0);
  for (const indexes of byJudge.values()) {
    const scores = indexes.map((index) => votes[index]?.total ?? 0);
    const normalized = zNormalize(scores, mean, std);
    indexes.forEach((index, offset) => {
      out[index] = normalized[offset] ?? 0;
    });
  }
  return out;
}

type CarriedVote = { vote: VoteInput; normalized: number };

function rankTrack(
  projects: readonly ProjectInput[],
  votes: readonly CarriedVote[],
  comparisons: readonly RankComparison[],
  trackId: string,
  judgeGroup: string,
  config: RankConfig,
): RankedRow[] {
  const stats = new Map<string, { avg: number; n: number; count: number }>();
  for (const project of projects) {
    let weightedSum = 0;
    let valueSum = 0;
    let count = 0;
    for (const item of votes) {
      if (item.vote.projectId !== project.id) continue;
      const weight = weightOf(item.vote, config);
      if (weight <= 0) continue;
      weightedSum += weight;
      valueSum += item.normalized * weight;
      count += 1;
    }
    stats.set(project.id, {
      avg: weightedSum > 0 ? round2(valueSum / weightedSum) : 0,
      n: weightedSum,
      count,
    });
  }

  const votedAverages: number[] = [];
  for (const row of stats.values()) {
    if (row.n > 0) votedAverages.push(row.avg);
  }
  const globalAvg =
    votedAverages.length > 0
      ? round2(
          votedAverages.reduce((sum, value) => sum + value, 0) /
            votedAverages.length,
        )
      : 0;

  const rubricScore = new Map<string, number>();
  const anchors: number[] = [];
  for (const project of projects) {
    const row = stats.get(project.id);
    const n = row?.n ?? 0;
    const score =
      n > 0
        ? round2(bayesianShrink(row?.avg ?? 0, n, globalAvg, config.bayesianC))
        : 0;
    rubricScore.set(project.id, score);
    if (n > 0) anchors.push(score);
  }

  const compared = new Set<string>();
  for (const comparison of comparisons) {
    compared.add(comparison.a);
    compared.add(comparison.b);
  }
  const scaled = scaleStrengths(
    bradleyTerry([...compared], comparisons),
    anchors,
    compared,
  );

  const draft: RankedRow[] = projects.map((project) => {
    const row = stats.get(project.id);
    const rubricComponent = rubricScore.get(project.id) ?? 0;
    const comparisonCount = comparisons.filter(
      (comparison) =>
        comparison.a === project.id || comparison.b === project.id,
    ).length;
    const scaledValue = scaled.get(project.id);
    const pairwiseForBlend = scaledValue ?? rubricComponent;
    const score =
      config.pairwiseWeight === 0
        ? rubricComponent
        : round2(
            blend(rubricComponent, pairwiseForBlend, config.pairwiseWeight),
          );
    return {
      projectId: project.id,
      trackId,
      judgeGroup,
      placement: null,
      score,
      rubricComponent,
      pairwiseComponent: scaledValue ?? 0,
      voteCount: row?.count ?? 0,
      comparisonCount,
    };
  });

  const order = new Map(projects.map((project, index) => [project.id, index]));
  const placeable = draft.filter(
    (row) =>
      row.voteCount > 0 ||
      (config.pairwiseWeight > 0 && row.comparisonCount > 0),
  );
  placeable.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return (order.get(a.projectId) ?? 0) - (order.get(b.projectId) ?? 0);
  });
  placeable.forEach((row, index) => {
    row.placement = index + 1;
  });
  return draft;
}

function scaleStrengths(
  strength: ReadonlyMap<string, number>,
  anchors: readonly number[],
  compared: ReadonlySet<string>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (compared.size === 0) return out;
  const values = [...compared].map((id) => strength.get(id) ?? 0);
  const lowStrength = Math.min(...values);
  const highStrength = Math.max(...values);
  const low = anchors.length > 0 ? Math.min(...anchors) : lowStrength;
  const high = anchors.length > 0 ? Math.max(...anchors) : highStrength;
  for (const id of compared) {
    const value = strength.get(id) ?? 0;
    if (anchors.length === 0) out.set(id, value);
    else if (highStrength === lowStrength) out.set(id, (low + high) / 2);
    else {
      out.set(
        id,
        low +
          ((value - lowStrength) / (highStrength - lowStrength)) * (high - low),
      );
    }
  }
  return out;
}

function trackOrder(projects: readonly ProjectInput[]): string[] {
  const seen = new Set<string>();
  for (const project of projects) {
    for (const trackId of project.trackIds) seen.add(trackId);
  }
  return [...seen];
}

function groupOrder(
  votes: readonly VoteInput[],
  comparisons: readonly RankComparison[],
): string[] {
  const seen = new Set<string>();
  for (const vote of votes) seen.add(vote.judgeGroup);
  for (const comparison of comparisons) seen.add(comparison.judgeGroup);
  if (seen.size === 0) seen.add("main");
  return [...seen];
}
