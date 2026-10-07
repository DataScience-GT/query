import { describe, expect, it } from "vitest";
import { DEFAULT_TIMERS, isLive, isOverTarget, isPastCutoff } from "./timers";

const t0 = new Date("2027-02-28T13:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
const timers = DEFAULT_TIMERS;

describe("isLive", () => {
  const walking = {
    handedOutAt: t0,
    arrivedAt: null,
    completedAt: null,
  };
  const atTable = {
    handedOutAt: t0,
    arrivedAt: at(60),
    completedAt: null,
  };

  it("holds a table for the walk limit after hand-out", () => {
    expect(isLive(walking, at(timers.walkLimitSeconds), timers)).toBe(true);
    expect(isLive(walking, at(timers.walkLimitSeconds + 1), timers)).toBe(
      false,
    );
  });

  it("holds it through the hard limit and grace after arrival", () => {
    const end =
      60 + timers.hardLimitSeconds + timers.submitGraceSeconds;
    expect(isLive(atTable, at(end), timers)).toBe(true);
    expect(isLive(atTable, at(end + 1), timers)).toBe(false);
  });

  it("measures from arrival, not hand-out, once the judge has tapped in", () => {
    expect(isLive(atTable, at(timers.walkLimitSeconds + 30), timers)).toBe(
      true,
    );
  });

  it("is never live once completed, or when never handed out", () => {
    expect(
      isLive({ ...atTable, completedAt: at(61) }, at(61), timers),
    ).toBe(false);
    expect(
      isLive(
        { handedOutAt: null, arrivedAt: null, completedAt: null },
        t0,
        timers,
      ),
    ).toBe(false);
  });

  it("honours a shorter limit from config", () => {
    const short = { ...timers, walkLimitSeconds: 30 };
    expect(isLive(walking, at(30), short)).toBe(true);
    expect(isLive(walking, at(31), short)).toBe(false);
  });
});

describe("isPastCutoff", () => {
  it("allows a score at the hard limit and within the grace after it", () => {
    expect(isPastCutoff(t0, at(timers.hardLimitSeconds), timers)).toBe(false);
    expect(
      isPastCutoff(
        t0,
        at(timers.hardLimitSeconds + timers.submitGraceSeconds),
        timers,
      ),
    ).toBe(false);
  });

  it("refuses one after the grace", () => {
    expect(
      isPastCutoff(
        t0,
        at(timers.hardLimitSeconds + timers.submitGraceSeconds + 1),
        timers,
      ),
    ).toBe(true);
  });
});

describe("isOverTarget", () => {
  it("turns over at the target and not before", () => {
    expect(isOverTarget(t0, at(timers.targetSeconds), timers)).toBe(false);
    expect(isOverTarget(t0, at(timers.targetSeconds + 1), timers)).toBe(true);
  });
});
