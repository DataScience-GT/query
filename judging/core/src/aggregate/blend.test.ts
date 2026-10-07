import { describe, expect, it } from "vitest";
import { blend } from "./blend";

describe("blend", () => {
  it("returns the rubric at weight 0 and the pairwise score at weight 1", () => {
    expect(blend(4, 10, 0)).toBe(4);
    expect(blend(4, 10, 1)).toBe(10);
  });

  it("takes the midpoint at a half", () => {
    expect(blend(4, 10, 0.5)).toBe(7);
  });

  it("rejects a weight outside 0 to 1", () => {
    expect(() => blend(1, 1, 1.1)).toThrow(/weight/);
    expect(() => blend(1, 1, -0.1)).toThrow(/weight/);
  });
});
