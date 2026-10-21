import { describe, expect, it } from "vitest";
import {
  MAX_SLOTS,
  appointmentTimes,
  firstSlotFrom,
  gridOf,
  slotAt,
  slotCount,
  slotStartsAt,
  timingProblems,
} from "./slots";
import type { ScheduleTiming } from "./slots";

const timing: ScheduleTiming = {
  windowStart: new Date("2027-02-08T14:00:00Z"),
  windowEnd: new Date("2027-02-08T16:05:00Z"),
  setupMinutes: 2,
  judgingMinutes: 6,
  teardownMinutes: 2,
  sameBuildingBreakMinutes: 10,
  crossBuildingBreakMinutes: 15,
};

describe("grid", () => {
  it("cuts the window into whole slots", () => {
    // 125 minutes of 10-minute slots: the last 5 minutes go unused.
    expect(slotCount(timing)).toBe(12);
  });

  it("rounds breaks up to whole slots", () => {
    expect(gridOf(timing)).toEqual({ slots: 12, sameGap: 1, crossGap: 2 });
    expect(
      gridOf({ ...timing, sameBuildingBreakMinutes: 0, crossBuildingBreakMinutes: 1 }),
    ).toEqual({ slots: 12, sameGap: 0, crossGap: 1 });
  });

  it("is empty for a window shorter than a slot", () => {
    expect(
      slotCount({ ...timing, windowEnd: new Date("2027-02-08T14:09:00Z") }),
    ).toBe(0);
  });
});

describe("times", () => {
  it("stores setup start, submission deadline and end", () => {
    expect(appointmentTimes(timing, 3)).toEqual({
      startsAt: new Date("2027-02-08T14:30:00Z"),
      deadlineAt: new Date("2027-02-08T14:38:00Z"),
      endsAt: new Date("2027-02-08T14:40:00Z"),
    });
  });

  it("maps a start time back to its slot", () => {
    expect(slotAt(timing, slotStartsAt(timing, 7))).toBe(7);
    expect(slotAt(timing, new Date("2027-02-08T14:05:00Z"))).toBeNull();
    expect(slotAt(timing, new Date("2027-02-08T13:50:00Z"))).toBeNull();
    // Slot 12 would end after the window.
    expect(slotAt(timing, new Date("2027-02-08T16:00:00Z"))).toBeNull();
  });

  it("finds the first slot that has not started", () => {
    expect(firstSlotFrom(timing, new Date("2027-02-08T13:00:00Z"))).toBe(0);
    expect(firstSlotFrom(timing, new Date("2027-02-08T14:20:00Z"))).toBe(2);
    expect(firstSlotFrom(timing, new Date("2027-02-08T14:20:01Z"))).toBe(3);
  });
});

describe("timingProblems", () => {
  it("accepts a sensible timing", () => {
    expect(timingProblems(timing)).toEqual([]);
  });

  it("refuses a window that ends before it starts", () => {
    expect(
      timingProblems({ ...timing, windowEnd: timing.windowStart }),
    ).toEqual(["End the judging window after it starts."]);
  });

  it("refuses a window shorter than one presentation", () => {
    expect(
      timingProblems({
        ...timing,
        windowEnd: new Date("2027-02-08T14:05:00Z"),
      })[0],
    ).toMatch(/shorter than one 10-minute presentation/);
  });

  it("refuses more slots than a room can have", () => {
    const long = {
      ...timing,
      setupMinutes: 0,
      judgingMinutes: 1,
      teardownMinutes: 0,
      windowEnd: new Date(timing.windowStart.getTime() + (MAX_SLOTS + 1) * 60_000),
    };
    expect(timingProblems(long)[0]).toMatch(/the most is 1440/);
  });

  it("refuses times off the minute and a cross break shorter than the same one", () => {
    expect(
      timingProblems({
        ...timing,
        windowStart: new Date("2027-02-08T14:00:30Z"),
        crossBuildingBreakMinutes: 5,
      }),
    ).toEqual([
      "Start and end the judging window on a whole minute.",
      "The break for changing buildings cannot be shorter than the break within one building.",
    ]);
  });
});
