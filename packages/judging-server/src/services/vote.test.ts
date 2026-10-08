import { describe, expect, it } from "vitest";
import { DEFAULT_TIMERS } from "@query/judging-core";
import { assessVote } from "./vote";

const criteria = [{ id: "creativity", min: 0, max: 10, weight: 1 }];
const arrived = new Date("2027-02-28T13:00:00Z");
const at = (seconds: number) => new Date(arrived.getTime() + seconds * 1000);

describe("assessVote", () => {
  it("refuses a vote outside judging_live", () => {
    const decision = assessVote({
      phase: "setup",
      arrivedAt: arrived,
      now: at(10),
      config: DEFAULT_TIMERS,
      criteria,
      scores: [{ criterionId: "creativity", value: 5 }],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.message).toMatch(/setup/);
  });

  it("names the configured hard limit when the score is late", () => {
    const config = { ...DEFAULT_TIMERS, hardLimitSeconds: 90, submitGraceSeconds: 0 };
    const decision = assessVote({
      phase: "judging_live",
      arrivedAt: arrived,
      now: at(91),
      config,
      criteria,
      scores: [{ criterionId: "creativity", value: 5 }],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.message).toContain("90s");
  });

  it("accepts a score inside the window and derives the total", () => {
    const decision = assessVote({
      phase: "judging_live",
      arrivedAt: arrived,
      now: at(10),
      config: DEFAULT_TIMERS,
      criteria,
      scores: [{ criterionId: "creativity", value: 8 }],
    });
    expect(decision).toEqual({ ok: true, total: 8 });
  });
});
