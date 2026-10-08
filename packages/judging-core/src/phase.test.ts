import { describe, expect, it } from "vitest";
import {
  assertPhaseAllows,
  assertTransition,
  canTransition,
  phaseAllows,
} from "./phase";

describe("phase", () => {
  it("walks an event from setup through archive", () => {
    const path = [
      "setup",
      "submissions_open",
      "submissions_closed",
      "judging_live",
      "judging_closed",
      "published",
      "archived",
    ] as const;
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      if (!from || !to) throw new Error("path");
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it("allows the steps an organizer actually takes backwards", () => {
    expect(canTransition("submissions_open", "setup")).toBe(true);
    expect(canTransition("submissions_closed", "submissions_open")).toBe(true);
    expect(canTransition("judging_closed", "judging_live")).toBe(true);
    expect(canTransition("published", "judging_closed")).toBe(true);
  });

  it("refuses a jump and a move out of the archive", () => {
    expect(canTransition("setup", "judging_live")).toBe(false);
    expect(canTransition("archived", "setup")).toBe(false);
    expect(() => assertTransition("setup", "published")).toThrow(/setup/);
  });

  it("permits a vote only while judging is live", () => {
    expect(phaseAllows("judging_live", "vote")).toBe(true);
    expect(phaseAllows("judging_closed", "vote")).toBe(false);
    expect(phaseAllows("submissions_open", "vote")).toBe(false);
    expect(() => assertPhaseAllows("setup", "vote")).toThrow(/vote/);
  });

  it("permits dispatch only while judging is live, and publish only after it closes", () => {
    expect(phaseAllows("judging_live", "dispatch")).toBe(true);
    expect(phaseAllows("judging_closed", "dispatch")).toBe(false);
    expect(phaseAllows("judging_closed", "publish")).toBe(true);
    expect(phaseAllows("judging_live", "publish")).toBe(false);
    expect(phaseAllows("judging_live", "compute")).toBe(true);
    expect(phaseAllows("submissions_open", "submit")).toBe(true);
    expect(phaseAllows("judging_live", "submit")).toBe(false);
    expect(phaseAllows("setup", "apply")).toBe(true);
    expect(phaseAllows("judging_live", "apply")).toBe(false);
  });
});
