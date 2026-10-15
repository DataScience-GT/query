import { describe, expect, it } from "vitest";
import { K_A, K_B, K_D, calibrate } from "./calibration";
import type { CalibrationEvaluation } from "./calibration";

// A small seeded generator (mulberry32), so every dataset below is the same on
// every run. No Math.random.
function seeded(seed: number) {
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Roughly normal: the sum of four uniforms, centred and scaled to sd 1.
  const normal = () =>
    (uniform() + uniform() + uniform() + uniform() - 2) * Math.sqrt(3);
  const shuffle = <T>(items: readonly T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(uniform() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  };
  return { uniform, normal, shuffle };
}

const DAY = Date.UTC(2027, 1, 6, 10, 0, 0);

const evaluation = (
  id: string,
  judgeId: string,
  score: number,
  over: Partial<CalibrationEvaluation> = {},
): CalibrationEvaluation => ({
  id,
  judgeId,
  challengeId: "general",
  entryId: `entry-${id}`,
  submittedAt: new Date(DAY),
  isComplete: true,
  ratings: [score],
  ...over,
});

const clampRating = (value: number) => Math.min(5, Math.max(1, value));

type Habit = {
  judgeId: string;
  /** Added to every score. */
  offset?: number;
  /** Multiplies the distance from 3. */
  spread?: number;
  /** Points added per grade, in grading order. */
  drift?: number;
  noise?: number;
};

/**
 * A pool of projects with a known quality, dealt out at random to judges with
 * known habits. Returns the evaluations and each project's true quality.
 */
function pool(options: {
  projects: number;
  judges: Habit[];
  seed: number;
  challengeId?: string;
}) {
  const random = seeded(options.seed);
  const quality = Array.from(
    { length: options.projects },
    () => 1.8 + 2.4 * random.uniform(),
  );
  const order = random.shuffle(quality.map((_, index) => index));
  const evaluations: CalibrationEvaluation[] = [];
  const truth = new Map<string, number>();

  order.forEach((project, position) => {
    const habit = options.judges[position % options.judges.length]!;
    const turn = Math.floor(position / options.judges.length);
    const raw =
      3 +
      (habit.spread ?? 1) * ((quality[project] as number) - 3) +
      (habit.offset ?? 0) +
      (habit.drift ?? 0) * turn +
      (habit.noise ?? 0.2) * random.normal();
    const id = `${options.challengeId ?? "general"}-${habit.judgeId}-${turn}`;
    truth.set(id, quality[project] as number);
    evaluations.push(
      evaluation(id, habit.judgeId, clampRating(raw), {
        challengeId: options.challengeId ?? "general",
        entryId: `project-${project}`,
        submittedAt: new Date(DAY + turn * 60_000),
      }),
    );
  });
  return { evaluations, truth };
}

function ranks(values: readonly number[]) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  sorted.forEach(({ index }, position) => {
    result[index] = position;
  });
  return result;
}

/** Spearman rank correlation. */
function spearman(a: readonly number[], b: readonly number[]) {
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (ra.length - 1) / 2;
  let top = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < ra.length; i++) {
    top += (ra[i]! - mean) * (rb[i]! - mean);
    sa += (ra[i]! - mean) ** 2;
    sb += (rb[i]! - mean) ** 2;
  }
  return top / Math.sqrt(sa * sb);
}

const scoreOf = (e: CalibrationEvaluation) =>
  e.ratings.reduce((sum, rating) => sum + rating, 0) / e.ratings.length;

function sdOf(values: readonly number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
  );
}

/** Least-squares slope of the values on their position. */
function slopeOf(values: readonly number[]) {
  const centre = (values.length - 1) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let along = 0;
  let across = 0;
  values.forEach((value, index) => {
    along += (index - centre) * (value - mean);
    across += (index - centre) ** 2;
  });
  return along / across;
}

describe("calibrate", () => {
  it("uses the documented pseudo-evaluation counts", () => {
    expect([K_A, K_B, K_D]).toEqual([3, 6, 10]);
  });

  it("returns nothing for no evaluations", () => {
    const result = calibrate([]);
    expect(result.adjusted.size).toBe(0);
    expect(result.judges).toEqual([]);
  });

  it("leaves one evaluation as it is", () => {
    const result = calibrate([evaluation("only", "judge", 4.25)]);
    expect(result.adjusted.get("only")).toBeCloseTo(4.25, 10);
    expect(result.judges).toEqual([
      {
        judgeId: "judge",
        challengeId: "general",
        evaluations: 1,
        offset: 0,
        spread: 1,
        drift: 0,
      },
    ]);
  });

  it("scores an evaluation as the mean of its ratings", () => {
    const result = calibrate([
      evaluation("a", "judge", 0, { ratings: [4, 5, 3, 4] }),
    ]);
    expect(result.adjusted.get("a")).toBeCloseTo(4, 10);
  });

  it("ignores incomplete evaluations and ones with no ratings", () => {
    const result = calibrate([
      evaluation("done", "judge", 4),
      evaluation("draft", "judge", 1, { isComplete: false }),
      evaluation("blank", "judge", 0, { ratings: [] }),
    ]);
    expect([...result.adjusted.keys()]).toEqual(["done"]);
    expect(result.judges).toHaveLength(1);
    expect(result.judges[0]?.evaluations).toBe(1);
  });

  it("does not correct the offset of the only judge in a pool", () => {
    const { evaluations } = pool({
      projects: 30,
      judges: [{ judgeId: "alone", offset: 0.9 }],
      seed: 5,
    });
    const result = calibrate(evaluations);
    // Nobody to compare them with: no offset and no spread.
    expect(result.judges[0]?.offset).toBeCloseTo(0, 10);
    expect(result.judges[0]?.spread).toBeCloseTo(1, 10);
    for (const e of evaluations) {
      expect(result.adjusted.get(e.id)).toBeCloseTo(scoreOf(e), 0);
    }
  });

  it("matches the model on a small pool worked by hand", () => {
    // Pool scores 2, 4, 4, 5: mu = 3.75. Taking each judge's mean out leaves
    // -1, 1 and -0.5, 0.5, so the sd a judge is measured against is
    // sqrt(2.5 / 4), not the plain pool sd of sqrt(1.1875).
    const mu = 3.75;
    const sd = Math.sqrt(2.5 / 4);
    // Judge a has 2 and 4: n = 2, so no drift. Mean 3, population sd 1.
    const offset = (2 / (2 + K_A)) * (3 - mu);
    const spread = 1 + (2 / (2 + K_B)) * (1 / sd - 1);
    const result = calibrate([
      evaluation("a1", "a", 2, { submittedAt: new Date(DAY) }),
      evaluation("a2", "a", 4, { submittedAt: new Date(DAY + 60_000) }),
      evaluation("b1", "b", 4, { submittedAt: new Date(DAY) }),
      evaluation("b2", "b", 5, { submittedAt: new Date(DAY + 60_000) }),
    ]);
    expect(result.adjusted.get("a1")).toBeCloseTo(
      mu + (2 - mu - offset) / spread,
      10,
    );
    expect(result.adjusted.get("a2")).toBeCloseTo(
      mu + (4 - mu - offset) / spread,
      10,
    );
    const a = result.judges.find((j) => j.judgeId === "a");
    expect(a?.offset).toBeCloseTo(offset, 10);
    expect(a?.spread).toBeCloseTo(spread, 10);
    expect(a?.drift).toBe(0);
  });

  describe("strict and lenient judges", () => {
    const { evaluations, truth } = pool({
      projects: 80,
      judges: [
        { judgeId: "strict", offset: -0.8 },
        { judgeId: "lenient", offset: 0.8 },
      ],
      seed: 11,
    });
    const result = calibrate(evaluations);

    it("rank projects far closer to their true quality than raw means do", () => {
      const quality = evaluations.map((e) => truth.get(e.id) as number);
      const raw = spearman(quality, evaluations.map(scoreOf));
      const adjusted = spearman(
        quality,
        evaluations.map((e) => result.adjusted.get(e.id) as number),
      );
      expect(raw).toBeLessThan(0.65);
      expect(adjusted).toBeGreaterThan(0.9);
      expect(adjusted - raw).toBeGreaterThan(0.25);
    });

    it("moves their scores by roughly the size of their bias", () => {
      const moves = evaluations.map((e) =>
        Math.abs((result.adjusted.get(e.id) as number) - scoreOf(e)),
      );
      const average = moves.reduce((sum, move) => sum + move, 0) / moves.length;
      expect(average).toBeGreaterThan(0.6);
      expect(average).toBeLessThan(1);
    });

    it("reports which one is strict and which lenient", () => {
      const strict = result.judges.find((j) => j.judgeId === "strict");
      const lenient = result.judges.find((j) => j.judgeId === "lenient");
      expect(strict?.offset).toBeLessThan(-0.5);
      expect(lenient?.offset).toBeGreaterThan(0.5);
      expect(strict?.evaluations).toBe(40);
    });

    it("does not mistake the gap between them for bunched scores", () => {
      // Both mark with an ordinary spread. The pool's plain spread also holds
      // the gap between their means; measured against that, both would look
      // bunched and every score would be stretched.
      for (const judge of result.judges) {
        expect(judge.spread).toBeGreaterThan(0.9);
        expect(judge.spread).toBeLessThan(1.1);
      }
      const quality = evaluations.map((e) => truth.get(e.id) as number);
      const adjusted = evaluations.map(
        (e) => result.adjusted.get(e.id) as number,
      );
      expect(sdOf(adjusted)).toBeLessThan(sdOf(quality) * 1.15);
    });

    it("brings the two judges' average scores together", () => {
      const meanOf = (
        judgeId: string,
        score: (e: CalibrationEvaluation) => number,
      ) => {
        const mine = evaluations.filter((e) => e.judgeId === judgeId);
        return mine.reduce((sum, e) => sum + score(e), 0) / mine.length;
      };
      const adjusted = (e: CalibrationEvaluation) =>
        result.adjusted.get(e.id) as number;
      expect(
        meanOf("lenient", scoreOf) - meanOf("strict", scoreOf),
      ).toBeGreaterThan(1.3);
      expect(
        Math.abs(meanOf("lenient", adjusted) - meanOf("strict", adjusted)),
      ).toBeLessThan(0.2);
    });
  });

  describe("a bunched judge", () => {
    const { evaluations } = pool({
      projects: 80,
      judges: [{ judgeId: "bunched", spread: 0.3 }, { judgeId: "normal" }],
      seed: 23,
    });
    const result = calibrate(evaluations);
    const of = (judgeId: string) =>
      evaluations.filter((e) => e.judgeId === judgeId);

    it("is stretched toward the pool's spread", () => {
      const bunched = of("bunched");
      const before = sdOf(bunched.map(scoreOf));
      const after = sdOf(
        bunched.map((e) => result.adjusted.get(e.id) as number),
      );
      expect(
        result.judges.find((j) => j.judgeId === "bunched")?.spread,
      ).toBeLessThan(0.7);
      expect(after).toBeGreaterThan(before * 1.4);
    });

    it("leaves the normal judge's spread close to where it was", () => {
      const normal = of("normal");
      const before = sdOf(normal.map(scoreOf));
      const after = sdOf(
        normal.map((e) => result.adjusted.get(e.id) as number),
      );
      expect(Math.abs(after - before)).toBeLessThan(before * 0.3);
    });
  });

  describe("a drifting judge", () => {
    const { evaluations } = pool({
      projects: 90,
      judges: [{ judgeId: "tiring", drift: -0.05 }, { judgeId: "steady" }],
      seed: 31,
    });
    const result = calibrate(evaluations);

    it("is detrended in grading order", () => {
      const mine = evaluations
        .filter((e) => e.judgeId === "tiring")
        .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
      const before = slopeOf(mine.map(scoreOf));
      const after = slopeOf(
        mine.map((e) => result.adjusted.get(e.id) as number),
      );
      expect(before).toBeLessThan(-0.04);
      expect(Math.abs(after)).toBeLessThan(Math.abs(before) * 0.4);
    });

    it("reports a drift that is negative for a judge who got harsher", () => {
      const tiring = result.judges.find((j) => j.judgeId === "tiring");
      const steady = result.judges.find((j) => j.judgeId === "steady");
      // Lost about 0.05 a grade over 44 grades, less the shrink.
      expect(tiring?.drift).toBeLessThan(-1.2);
      expect(Math.abs(steady?.drift ?? 1)).toBeLessThan(0.7);
    });
  });

  it("breaks a tie in submission time by id when ordering a judge's grades", () => {
    const climbing = calibrate([
      evaluation("a", "judge", 1),
      evaluation("b", "judge", 3),
      evaluation("c", "judge", 5),
    ]);
    const falling = calibrate([
      evaluation("c", "judge", 1),
      evaluation("b", "judge", 3),
      evaluation("a", "judge", 5),
    ]);
    expect(climbing.judges[0]?.drift).toBeGreaterThan(0);
    expect(falling.judges[0]?.drift).toBeLessThan(0);
  });

  it("barely corrects a judge with a single grade", () => {
    const { evaluations } = pool({
      projects: 40,
      judges: [{ judgeId: "a" }, { judgeId: "b", offset: 0.3 }],
      seed: 41,
    });
    const once = evaluation("once", "visitor", 4.9);
    const all = [...evaluations, once];
    const result = calibrate(all);
    const visitor = result.judges.find((j) => j.judgeId === "visitor");
    expect(visitor?.evaluations).toBe(1);
    expect(visitor?.spread).toBe(1);
    expect(visitor?.drift).toBe(0);

    // One grade is mostly the project, not the judge: the pull toward the pool
    // is 1 / (1 + K_A) of the distance, a quarter.
    const mu = all.reduce((sum, e) => sum + scoreOf(e), 0) / all.length;
    expect(visitor?.offset).toBeCloseTo((4.9 - mu) / (1 + K_A), 10);
    const moved = Math.abs(4.9 - (result.adjusted.get("once") as number));
    expect(moved).toBeLessThan(Math.abs(4.9 - mu) * 0.3);
  });

  it("leaves unbiased judges almost where they were", () => {
    const { evaluations } = pool({
      projects: 90,
      judges: [{ judgeId: "a" }, { judgeId: "b" }, { judgeId: "c" }],
      seed: 53,
    });
    const result = calibrate(evaluations);
    const moves = evaluations.map((e) =>
      Math.abs((result.adjusted.get(e.id) as number) - scoreOf(e)),
    );
    const average = moves.reduce((sum, move) => sum + move, 0) / moves.length;
    // Chance alone gives each judge's thirty projects a slightly different
    // mean, so some movement is expected; a biased judge moves several times as far.
    expect(average).toBeLessThan(0.2);
    expect(Math.max(...moves)).toBeLessThan(0.6);
    expect(
      spearman(
        evaluations.map(scoreOf),
        evaluations.map((e) => result.adjusted.get(e.id) as number),
      ),
    ).toBeGreaterThan(0.95);
    for (const judge of result.judges) {
      expect(Math.abs(judge.offset)).toBeLessThan(0.2);
      expect(judge.spread).toBeGreaterThan(0.8);
      expect(judge.spread).toBeLessThan(1.25);
    }
  });

  describe("pools", () => {
    const table = pool({
      projects: 40,
      judges: [{ judgeId: "t1" }, { judgeId: "t2", offset: 0.5 }],
      seed: 61,
      challengeId: "general",
    }).evaluations;
    // A sponsor whose guests are harsh, and one guest who also judges at the tables.
    const sponsor = pool({
      projects: 20,
      judges: [
        { judgeId: "g1", offset: -1 },
        { judgeId: "t1", offset: -1 },
      ],
      seed: 67,
      challengeId: "sponsor",
    }).evaluations;

    it("never mix: a pool calibrates the same alone or beside another", () => {
      const together = calibrate([...table, ...sponsor]);
      const alone = calibrate(table);
      for (const e of table) {
        expect(together.adjusted.get(e.id)).toBe(alone.adjusted.get(e.id));
      }
      const sponsorAlone = calibrate(sponsor);
      for (const e of sponsor) {
        expect(together.adjusted.get(e.id)).toBe(
          sponsorAlone.adjusted.get(e.id),
        );
      }
    });

    it("give a judge in two challenges separate parameters in each", () => {
      const together = calibrate([...table, ...sponsor]);
      const both = together.judges.filter((j) => j.judgeId === "t1");
      expect(both.map((j) => j.challengeId).sort()).toEqual([
        "general",
        "sponsor",
      ]);
      const [general, other] = [
        both.find((j) => j.challengeId === "general")!,
        both.find((j) => j.challengeId === "sponsor")!,
      ];
      expect(general.evaluations).toBe(20);
      expect(other.evaluations).toBe(10);
      // Stricter than the lenient t2 at the tables; as harsh as the sponsor's
      // own guest, so near level there (ten grades each leave some chance in it).
      expect(general.offset).toBeLessThan(-0.1);
      expect(Math.abs(other.offset)).toBeLessThan(0.25);
      expect(other.offset - general.offset).toBeGreaterThan(0.2);
    });
  });

  it("keeps every output between 1 and 5", () => {
    const random = seeded(71);
    const extreme: CalibrationEvaluation[] = [];
    for (let i = 0; i < 60; i++) {
      // A judge who only ever gives 5s next to one who only gives 1s and 2s,
      // and one who swings between the ends.
      const judgeId = ["high", "low", "swing"][i % 3]!;
      const score =
        judgeId === "high"
          ? 5
          : judgeId === "low"
            ? 1 + Math.floor(random.uniform() * 2)
            : random.uniform() < 0.5
              ? 1
              : 5;
      extreme.push(
        evaluation(`x-${i}`, judgeId, score, {
          submittedAt: new Date(DAY + i * 60_000),
        }),
      );
    }
    const result = calibrate(extreme);
    expect(result.adjusted.size).toBe(60);
    for (const value of result.adjusted.values()) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
    }
    for (const judge of result.judges) {
      expect(judge.spread).toBeGreaterThanOrEqual(0.5);
      expect(judge.spread).toBeLessThanOrEqual(2);
    }
  });

  describe("a judge who gives every project the same score", () => {
    const { evaluations } = pool({
      projects: 40,
      judges: [{ judgeId: "varied" }, { judgeId: "flat", spread: 0, noise: 0 }],
      seed: 83,
    });
    const flat = evaluations.filter((e) => e.judgeId === "flat");
    const result = calibrate(evaluations);

    it("is clamped at a spread of 0.5 and given one sane score throughout", () => {
      expect(new Set(flat.map(scoreOf)).size).toBe(1);
      const judge = result.judges.find((j) => j.judgeId === "flat");
      expect(judge?.spread).toBe(0.5);
      expect(judge?.drift).toBeCloseTo(0, 10);

      const values = flat.map((e) => result.adjusted.get(e.id) as number);
      for (const value of values) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
        expect(value).toBeCloseTo(values[0] as number, 10);
      }
    });

    it("does not disturb the other judge", () => {
      const varied = evaluations.filter((e) => e.judgeId === "varied");
      for (const e of varied) {
        const adjusted = result.adjusted.get(e.id) as number;
        expect(Number.isFinite(adjusted)).toBe(true);
        expect(Math.abs(adjusted - scoreOf(e))).toBeLessThan(0.5);
      }
    });
  });

  it("copes with a pool where every score is the same", () => {
    const result = calibrate(
      ["a", "b", "c", "d"].map((id, i) =>
        evaluation(id, i % 2 ? "x" : "y", 3.5, {
          submittedAt: new Date(DAY + i * 60_000),
        }),
      ),
    );
    for (const value of result.adjusted.values())
      expect(value).toBeCloseTo(3.5, 10);
    for (const judge of result.judges) {
      expect(judge.spread).toBe(1);
      expect(judge.offset).toBeCloseTo(0, 10);
    }
  });

  it("handles projects with several evaluations, as older data has", () => {
    const { evaluations } = pool({
      projects: 30,
      judges: [
        { judgeId: "a", offset: -0.6 },
        { judgeId: "b", offset: 0.6 },
        { judgeId: "c" },
      ],
      seed: 97,
    });
    // Every judge also graded the first ten projects.
    const repeats = evaluations.slice(0, 10).flatMap((first) =>
      ["a", "b", "c"]
        .filter((judgeId) => judgeId !== first.judgeId)
        .map((judgeId) =>
          evaluation(`again-${first.id}-${judgeId}`, judgeId, scoreOf(first), {
            entryId: first.entryId,
            submittedAt: new Date(DAY + 3_600_000),
          }),
        ),
    );
    const all = [...evaluations, ...repeats];
    const result = calibrate(all);
    expect(result.adjusted.size).toBe(all.length);
    expect(new Set(all.map((e) => e.entryId)).size).toBe(30);
    for (const value of result.adjusted.values()) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it("gives the same answer whatever order the evaluations come in", () => {
    const { evaluations } = pool({
      projects: 60,
      judges: [
        { judgeId: "strict", offset: -0.7, drift: -0.03 },
        { judgeId: "lenient", offset: 0.7, spread: 0.6 },
        { judgeId: "plain" },
      ],
      seed: 101,
    });
    const other = pool({
      projects: 20,
      judges: [{ judgeId: "plain", offset: 0.4 }, { judgeId: "guest" }],
      seed: 103,
      challengeId: "sponsor",
    }).evaluations;
    const all = [...evaluations, ...other];

    const forward = calibrate(all);
    const shuffled = calibrate(seeded(7).shuffle(all));
    const reversed = calibrate([...all].reverse());

    for (const result of [shuffled, reversed]) {
      expect(result.judges).toEqual(forward.judges);
      expect([...result.adjusted.entries()].sort()).toEqual(
        [...forward.adjusted.entries()].sort(),
      );
    }
  });

  it("does not change its input", () => {
    const { evaluations } = pool({
      projects: 12,
      judges: [{ judgeId: "a" }, { judgeId: "b" }],
      seed: 107,
    });
    const before = JSON.stringify(evaluations);
    calibrate(evaluations);
    expect(JSON.stringify(evaluations)).toBe(before);
  });
});
