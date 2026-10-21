// Slot arithmetic for the presentation schedule. A judging window is cut into
// equal slots of setup + judging + teardown minutes, and every appointment
// starts on a slot boundary. Breaks between one project's presentations are
// counted in whole slots, rounded up, so a 15-minute break on a 10-minute grid
// leaves two empty slots rather than one and a half.

/** The columns judging_schedule stores, named the same so a saved row fits. */
export type ScheduleTiming = {
  windowStart: Date;
  windowEnd: Date;
  setupMinutes: number;
  judgingMinutes: number;
  teardownMinutes: number;
  sameBuildingBreakMinutes: number;
  crossBuildingBreakMinutes: number;
};

/**
 * Most slots one room can have. Keeps move choices and the solver's search
 * bounded however long a window an organiser types.
 */
export const MAX_SLOTS = 1440;

const MINUTE = 60_000;

export function slotMinutes(timing: ScheduleTiming): number {
  return timing.setupMinutes + timing.judgingMinutes + timing.teardownMinutes;
}

/** Whole slots that fit in the window; a partial slot at the end is unused. */
export function slotCount(timing: ScheduleTiming): number {
  const windowMinutes =
    (timing.windowEnd.getTime() - timing.windowStart.getTime()) / MINUTE;
  const length = slotMinutes(timing);
  if (length <= 0 || windowMinutes <= 0) return 0;
  return Math.floor(windowMinutes / length);
}

/** Empty slots a break needs between two presentations. */
export function breakSlots(breakMinutes: number, length: number): number {
  return Math.ceil(breakMinutes / length);
}

/** The grid the solver works on: slot count and both breaks in slots. */
export function gridOf(timing: ScheduleTiming) {
  const length = slotMinutes(timing);
  return {
    slots: slotCount(timing),
    sameGap: breakSlots(timing.sameBuildingBreakMinutes, length),
    crossGap: breakSlots(timing.crossBuildingBreakMinutes, length),
  };
}

/**
 * What is wrong with a timing, as sentences an organiser can act on. Empty
 * when it is usable.
 */
export function timingProblems(timing: ScheduleTiming): string[] {
  const problems: string[] = [];
  const onMinute = (date: Date) => date.getTime() % MINUTE === 0;

  if (!onMinute(timing.windowStart) || !onMinute(timing.windowEnd)) {
    problems.push("Start and end the judging window on a whole minute.");
  }
  if (timing.windowEnd <= timing.windowStart) {
    problems.push("End the judging window after it starts.");
  } else if (slotCount(timing) < 1) {
    problems.push(
      `The window is shorter than one ${slotMinutes(timing)}-minute presentation. Lengthen it or shorten the presentation.`,
    );
  } else if (slotCount(timing) > MAX_SLOTS) {
    problems.push(
      `That window holds ${slotCount(timing)} presentations per room; the most is ${MAX_SLOTS}. Shorten the window or lengthen the presentation.`,
    );
  }
  if (timing.crossBuildingBreakMinutes < timing.sameBuildingBreakMinutes) {
    problems.push(
      "The break for changing buildings cannot be shorter than the break within one building.",
    );
  }
  return problems;
}

export function slotStartsAt(timing: ScheduleTiming, slot: number): Date {
  return new Date(
    timing.windowStart.getTime() + slot * slotMinutes(timing) * MINUTE,
  );
}

/** The slot an appointment starting at `startsAt` is in, or null off the grid. */
export function slotAt(timing: ScheduleTiming, startsAt: Date): number | null {
  const offset = startsAt.getTime() - timing.windowStart.getTime();
  const length = slotMinutes(timing) * MINUTE;
  if (offset < 0 || offset % length !== 0) return null;
  const slot = offset / length;
  return slot < slotCount(timing) ? slot : null;
}

/** The first slot that starts at or after `now`. */
export function firstSlotFrom(timing: ScheduleTiming, now: Date): number {
  const offset = now.getTime() - timing.windowStart.getTime();
  if (offset <= 0) return 0;
  return Math.ceil(offset / (slotMinutes(timing) * MINUTE));
}

/**
 * The three times an appointment row stores: when the room starts setting
 * up, when judges must have submitted, and when the room is free again.
 */
export function appointmentTimes(timing: ScheduleTiming, slot: number) {
  const startsAt = slotStartsAt(timing, slot);
  return {
    startsAt,
    deadlineAt: new Date(
      startsAt.getTime() +
        (timing.setupMinutes + timing.judgingMinutes) * MINUTE,
    ),
    endsAt: new Date(startsAt.getTime() + slotMinutes(timing) * MINUTE),
  };
}
