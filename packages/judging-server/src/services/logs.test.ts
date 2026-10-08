import { describe, expect, it } from "vitest";
import { logsForHandout } from "./logs";

describe("logsForHandout", () => {
  it("writes exactly one row when nothing has lapsed", () => {
    expect(logsForHandout([]).map((row) => row.kind)).toEqual(["visit.handed_out"]);
  });

  it("writes one void row per lapsed visit, then the hand-out", () => {
    expect(logsForHandout(["a", "b"]).map((row) => row.kind)).toEqual([
      "visit.voided",
      "visit.voided",
      "visit.handed_out",
    ]);
  });
});
