import { describe, expect, it } from "vitest";
import { nextTab } from "./tabs";

describe("nextTab", () => {
  it("steps with the arrows", () => {
    expect(nextTab("ArrowRight", 0, 3)).toBe(1);
    expect(nextTab("ArrowLeft", 2, 3)).toBe(1);
  });

  it("wraps at both ends", () => {
    expect(nextTab("ArrowRight", 2, 3)).toBe(0);
    expect(nextTab("ArrowLeft", 0, 3)).toBe(2);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextTab("Home", 2, 3)).toBe(0);
    expect(nextTab("End", 0, 3)).toBe(2);
  });

  it("leaves every other key alone, so Tab still moves on", () => {
    for (const key of ["Tab", "Enter", " ", "ArrowDown", "a"]) {
      expect(nextTab(key, 1, 3), key).toBeNull();
    }
  });
});
