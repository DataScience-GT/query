// Shared judge scoring / queue utilities
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
}

/**
 * Z-score normalizes a judge's scores relative to their own mean/stddev.
 * This removes per-judge harshness/leniency bias before aggregation.
 * Returns null if fewer than 2 data points (can't compute meaningful stddev).
 */
export function zNormalize(
  scores: number[],
  globalMean: number,
  globalStd: number,
): number[] {
  if (scores.length < 2) return scores.map(() => globalMean);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  if (std === 0) return scores.map(() => globalMean); // judge gave same score to everything
  return scores.map((v) => globalMean + ((v - mean) / std) * globalStd);
}

/**
 * Coverage-maximizing round-robin assignment.
 * Guarantees every project is seen at least `minCoverage` times before
 * any project gets an extra judge. Respects track constraints.
 */
export function buildCoverageQueues(
  judgeAssignmentsList: { judgeId: string; track: string | null }[],
  projects: {
    id: string;
    tracks: string[] | null;
    challenges: string[] | null;
    tableNumber: number;
  }[],
  mainTracks: Set<string>,
  opts: {
    minProjects: number;
    maxProjects: number;
    shuffle: boolean;
    groupSpecial: boolean;
  },
): Map<string, string[]> {
  const queues = new Map<string, string[]>();
  for (const a of judgeAssignmentsList) queues.set(a.judgeId, []);

  // Coverage counter: projectId -> how many judges are assigned
  const coverage = new Map<string, number>(projects.map((p) => [p.id, 0]));

  // For each judge, determine their eligible project pool
  const eligiblePool = new Map<string, typeof projects>();
  for (const a of judgeAssignmentsList) {
    const track = a.track;
    const isSpecial = track ? !mainTracks.has(track) : false;
    const pool = track
      ? projects.filter((p) => {
          const inTracks = p.tracks?.includes(track) ?? false;
          const inChallenges = p.challenges?.includes(track) ?? false;
          const matchCreateX =
            track.toLowerCase() === "createx" &&
            !!(p as { isCreateX?: boolean }).isCreateX;
          return inTracks || inChallenges || matchCreateX;
        })
      : projects;

    if (isSpecial) {
      // Special judges always get their full pool
      const ordered = opts.groupSpecial ? pool : shuffleArray(pool);
      queues.set(
        a.judgeId,
        ordered.map((p) => p.id),
      );
      for (const p of ordered)
        coverage.set(p.id, (coverage.get(p.id) ?? 0) + 1);
      eligiblePool.set(a.judgeId, []);
    } else {
      eligiblePool.set(a.judgeId, opts.shuffle ? shuffleArray(pool) : pool);
    }
  }

  // Round-robin fill: prioritize under-covered projects
  const mainJudges = judgeAssignmentsList.filter(
    (a) => !a.track || mainTracks.has(a.track),
  );

  let anyChange = true;
  while (anyChange) {
    anyChange = false;
    for (const a of mainJudges) {
      const queue = queues.get(a.judgeId)!;
      if (queue.length >= opts.maxProjects) continue;
      const pool = eligiblePool.get(a.judgeId)!;

      // Find the next project with the lowest coverage that isn't already in this queue
      const assigned = new Set(queue);
      const candidate = pool
        .filter((p) => !assigned.has(p.id))
        .sort(
          (a, b) => (coverage.get(a.id) ?? 0) - (coverage.get(b.id) ?? 0),
        )[0];

      if (!candidate) continue;
      if (
        queue.length >= opts.minProjects &&
        (coverage.get(candidate.id) ?? 0) > 0
      )
        continue;

      queue.push(candidate.id);
      coverage.set(candidate.id, (coverage.get(candidate.id) ?? 0) + 1);
      anyChange = true;
    }
  }

  // Shift/rotate the generated queues to stagger sequences and reduce judge bias
  for (let i = 0; i < judgeAssignmentsList.length; i++) {
    const judgeId = judgeAssignmentsList[i].judgeId;
    const q = queues.get(judgeId);
    if (q && q.length > 1) {
      const offset = i % q.length;
      const rotated = [...q.slice(offset), ...q.slice(0, offset)];
      queues.set(judgeId, rotated);
    }
  }

  return queues;
}