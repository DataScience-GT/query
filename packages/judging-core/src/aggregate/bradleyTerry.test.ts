import { describe, expect, it } from "vitest";
import { bradleyTerry } from "./bradleyTerry";

describe("bradleyTerry", () => {
  it("returns an empty map when there is nobody", () => {
    expect(bradleyTerry([], []).size).toBe(0);
  });

  it("leaves everyone equal when there are no comparisons", () => {
    const strength = bradleyTerry(["a", "b"], []);
    expect(strength.get("a")).toBe(1);
    expect(strength.get("b")).toBe(1);
  });

  it("ranks a consistent set in transitive order", () => {
    const strength = bradleyTerry(
      ["a", "b", "c"],
      [
        { a: "a", b: "b", outcome: "a" },
        { a: "b", b: "c", outcome: "a" },
        { a: "a", b: "c", outcome: "a" },
      ],
    );
    const a = strength.get("a") ?? 0;
    const b = strength.get("b") ?? 0;
    const c = strength.get("c") ?? 0;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it("puts a tie closer together than a sweep", () => {
    const tied = bradleyTerry(
      ["a", "b"],
      [
        { a: "a", b: "b", outcome: "tie" },
        { a: "a", b: "b", outcome: "tie" },
      ],
    );
    const swept = bradleyTerry(
      ["a", "b"],
      [
        { a: "a", b: "b", outcome: "a" },
        { a: "a", b: "b", outcome: "a" },
      ],
    );
    const tieGap = Math.abs((tied.get("a") ?? 0) - (tied.get("b") ?? 0));
    const sweepGap = Math.abs((swept.get("a") ?? 0) - (swept.get("b") ?? 0));
    expect(tieGap).toBeLessThan(sweepGap);
  });
});
