import { zNormalize } from "./helpers";

const round2 = (n: number) => Math.round(n * 100) / 100;
const C = 2;

export type WeightVote = { judgeId: string; score: number };
export type WeightProject = { id: string; votes: readonly WeightVote[] };

export type WeightedProject = {
  id: string;
  voteCount: number;
  normalizedAvg: number;
  weightedScore: number;
  normalizedScores: number[];
};

/**
 * The ranking the club site publishes: z-score each judge, average per
 * project, shrink toward the mean of those averages with c = 2. Panel's
 * `rank()` at pairwise weight 0 is checked against this function.
 */
export function weightProjects(projects: readonly WeightProject[]): WeightedProject[] {
  const scoresByJudge = new Map<string, number[]>();
  for (const project of projects) {
    for (const vote of project.votes) {
      const existing = scoresByJudge.get(vote.judgeId) ?? [];
      existing.push(vote.score);
      scoresByJudge.set(vote.judgeId, existing);
    }
  }

  const allRawScores = [...scoresByJudge.values()].flat();
  const globalMean =
    allRawScores.length > 0
      ? allRawScores.reduce((a, b) => a + b, 0) / allRawScores.length
      : 0;
  const globalVariance =
    allRawScores.length > 0
      ? allRawScores.reduce((sum, value) => sum + (value - globalMean) ** 2, 0) /
        allRawScores.length
      : 1;
  const globalStd = Math.sqrt(globalVariance) || 1;

  const normalizedScoreLookup = new Map<string, Map<number, number>>();
  for (const [judgeId, rawScores] of scoresByJudge.entries()) {
    const normalized = zNormalize(rawScores, globalMean, globalStd);
    const lookup = new Map<number, number>();
    rawScores.forEach((raw, index) => {
      const existing = lookup.get(raw);
      const value = normalized[index]!;
      lookup.set(raw, existing !== undefined ? (existing + value) / 2 : value);
    });
    normalizedScoreLookup.set(judgeId, lookup);
  }

  const raw = projects.map((project) => {
    const voteCount = project.votes.length;
    const normalizedScores = project.votes.map(
      (vote) => normalizedScoreLookup.get(vote.judgeId)?.get(vote.score) ?? vote.score,
    );
    const normalizedAvg =
      voteCount > 0
        ? round2(normalizedScores.reduce((sum, value) => sum + value, 0) / voteCount)
        : 0;
    return { id: project.id, voteCount, normalizedAvg, normalizedScores };
  });

  const voted = raw.filter((row) => row.voteCount > 0);
  const globalAvg =
    voted.length > 0
      ? round2(voted.reduce((sum, row) => sum + row.normalizedAvg, 0) / voted.length)
      : 0;

  return raw.map((row) => ({
    ...row,
    weightedScore:
      row.voteCount > 0
        ? round2(
            (row.voteCount / (row.voteCount + C)) * row.normalizedAvg +
              (C / (row.voteCount + C)) * globalAvg,
          )
        : 0,
  }));
}
