import { describe, expect, it } from "vitest";
import { DEFAULT_TIMERS } from "@query/judging-core";
import { visitsOverTarget } from "./overtime";

const arrived = new Date("2027-02-28T13:00:00Z");

describe("visitsOverTarget", () => {
  it("includes a judge who has stayed past the target", () => {
    const rows = visitsOverTarget(
      [
        {
          visitId: "late",
          eventId: "event",
          judgeId: "judge",
          arrivedAt: arrived,
          config: DEFAULT_TIMERS,
        },
        {
          visitId: "early",
          eventId: "event",
          judgeId: "other",
          arrivedAt: new Date(arrived.getTime() + 10_000),
          config: DEFAULT_TIMERS,
        },
      ],
      new Date(arrived.getTime() + DEFAULT_TIMERS.targetSeconds * 1000 + 1000),
    );
    expect(rows.map((row) => row.visitId)).toEqual(["late"]);
  });
});
