import { describe, expect, it } from "vitest";
import { DEFAULT_TIMERS } from "@query/judging-core";
import { judgeFloorState } from "./floor";

const arrived = new Date("2027-02-28T13:00:00Z");

describe("judgeFloorState", () => {
  it("marks a judge with no table as idle", () => {
    expect(judgeFloorState(null, arrived, DEFAULT_TIMERS)).toEqual({
      state: "idle",
      overtime: false,
    });
  });

  it("marks a judge who has not arrived as walking", () => {
    expect(judgeFloorState({ arrivedAt: null }, arrived, DEFAULT_TIMERS).state).toBe("walking");
  });

  it("marks overtime only after the target time at the table", () => {
    const early = judgeFloorState({ arrivedAt: arrived }, new Date(arrived.getTime() + 1000), DEFAULT_TIMERS);
    const late = judgeFloorState(
      { arrivedAt: arrived },
      new Date(arrived.getTime() + DEFAULT_TIMERS.targetSeconds * 1000 + 1000),
      DEFAULT_TIMERS,
    );
    expect(early).toEqual({ state: "at table", overtime: false });
    expect(late).toEqual({ state: "at table", overtime: true });
  });
});
