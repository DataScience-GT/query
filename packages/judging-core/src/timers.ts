/**
 * Visit clocks. Every function takes `now` so a replay of an event does not
 * depend on when the code happens to run.
 *
 * The defaults match the timings the first event used: three minutes at a
 * table, four minutes hard, four minutes to walk, fifteen seconds of grace
 * for a submit that left the phone on the buzzer.
 */

export type TimerConfig = {
  targetSeconds: number;
  hardLimitSeconds: number;
  walkLimitSeconds: number;
  submitGraceSeconds: number;
};

export const DEFAULT_TIMERS: TimerConfig = {
  targetSeconds: 180,
  hardLimitSeconds: 240,
  walkLimitSeconds: 240,
  submitGraceSeconds: 15,
};

export type VisitClock = {
  handedOutAt: Date | null;
  arrivedAt: Date | null;
  completedAt: Date | null;
};

/**
 * Whether a visit still holds its table. Walking: until the walk limit after
 * hand-out. At the table: until the hard limit (plus grace) after arrival.
 */
export function isLive(
  slot: VisitClock,
  now: Date,
  config: TimerConfig,
): boolean {
  if (slot.completedAt) return false;
  const t = now.getTime();
  if (slot.arrivedAt) {
    return (
      t <=
      slot.arrivedAt.getTime() +
        (config.hardLimitSeconds + config.submitGraceSeconds) * 1000
    );
  }
  if (slot.handedOutAt) {
    return t <= slot.handedOutAt.getTime() + config.walkLimitSeconds * 1000;
  }
  return false;
}

/** Past the hard cutoff, with grace: a score now arrives too late to count. */
export function isPastCutoff(
  arrivedAt: Date,
  now: Date,
  config: TimerConfig,
): boolean {
  return (
    now.getTime() >
    arrivedAt.getTime() +
      (config.hardLimitSeconds + config.submitGraceSeconds) * 1000
  );
}

/** The judge page turns amber here. Measured from arrival, not hand-out. */
export function isOverTarget(
  arrivedAt: Date,
  now: Date,
  config: TimerConfig,
): boolean {
  return now.getTime() > arrivedAt.getTime() + config.targetSeconds * 1000;
}
