import type { RouterOutputs } from "@query/api";

export type CalibrationChallenge =
  RouterOutputs["judging"]["results"]["list"]["calibration"][number];
export type CalibratedJudge = CalibrationChallenge["judges"][number];

type Numbers = Pick<CalibratedJudge, "grades" | "offset" | "spread" | "drift">;

// How far a number has to sit from "no correction" before it is worth saying
// out loud. Offset and drift are in rating points; spread is a multiple of the
// pool's, so 1 is the same. Chance alone moves them for a judge with no habit
// at all (which projects they drew, and in what order), by about 0.1 for the
// offset and 0.3 for the drift over thirty grades, so these sit about twice
// that above zero.
const OFFSET_NOTICED = 0.2;
const SPREAD_NOTICED = 0.15;
const DRIFT_NOTICED = 0.6;
// With fewer grades than this the correction is mostly shrunk away.
const FEW_GRADES = 3;

/** +0.38, -0.45, 0.00: the sign shown so a direction reads at a glance. */
export function signed(value: number) {
  const text = Math.abs(value).toFixed(2);
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text;
}

/** What a judge's numbers say about how they mark, in plain words. */
export function describeJudge(judge: Numbers): string[] {
  if (judge.grades < FEW_GRADES) return ["Too few grades to adjust much"];

  const phrases: string[] = [];
  const size = Math.abs(judge.offset).toFixed(2);
  if (judge.offset <= -OFFSET_NOTICED) {
    phrases.push(`Stricter than average by ${size}`);
  } else if (judge.offset >= OFFSET_NOTICED) {
    phrases.push(`More lenient than average by ${size}`);
  }
  if (judge.spread <= 1 - SPREAD_NOTICED) {
    phrases.push("Scores bunched together");
  } else if (judge.spread >= 1 + SPREAD_NOTICED) {
    phrases.push("Scores spread wider than average");
  }
  if (judge.drift <= -DRIFT_NOTICED) {
    phrases.push("Got harsher through the day");
  } else if (judge.drift >= DRIFT_NOTICED) {
    phrases.push("Got more lenient through the day");
  }
  return phrases.length > 0 ? phrases : ["In line with the other judges"];
}

/** The numbers behind the words: 12 grades · offset -0.38 · spread 0.72 · drift -0.45 */
export function judgeNumbers(judge: Numbers) {
  return [
    `${judge.grades} ${judge.grades === 1 ? "grade" : "grades"}`,
    `offset ${signed(judge.offset)}`,
    `spread ${judge.spread.toFixed(2)}`,
    `drift ${signed(judge.drift)}`,
  ].join(" · ");
}
