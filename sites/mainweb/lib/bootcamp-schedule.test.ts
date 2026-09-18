import { describe, it, expect } from "vitest";
import {
  BOOTCAMP_CURRICULUM,
  BOOTCAMP_MEETING_TIME,
  BOOTCAMP_ROOM,
  BOOTCAMP_WORKSPACE_URL,
  weekEntry,
} from "./bootcamp-schedule";

// A hand-edited constant published on a public page. Most of this is vacuous
// while it is empty — these arm themselves the moment the real weeks are typed
// in, which is the one moment nobody runs a test on purpose.

describe("BOOTCAMP_CURRICULUM", () => {
  it("numbers each week once", () => {
    const weeks = BOOTCAMP_CURRICULUM.map((entry) => entry.week);
    // A duplicate wins the `find` in weekEntry and drops the other week.
    expect(new Set(weeks).size).toBe(weeks.length);
  });

  it("counts up", () => {
    const weeks = BOOTCAMP_CURRICULUM.map((entry) => entry.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
  });

  it("starts at week 1 and leaves no gap", () => {
    // Sessions reference weeks by number; a gap renders with no title.
    BOOTCAMP_CURRICULUM.forEach((entry, index) => {
      expect(entry.week).toBe(index + 1);
    });
  });

  it("gives every week something to render", () => {
    for (const entry of BOOTCAMP_CURRICULUM) {
      expect(entry.title.trim()).not.toBe("");
      expect(entry.desc.trim()).not.toBe("");
    }
  });

  it("links notebooks over https, or not at all", () => {
    for (const entry of BOOTCAMP_CURRICULUM) {
      if (entry.deepnoteUrl === undefined) continue;
      expect(entry.deepnoteUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("the unset values", () => {
  it("are null rather than an empty string", () => {
    // Surfaces test for null; "" slips through as a blank room and a dead button.
    for (const value of [
      BOOTCAMP_ROOM,
      BOOTCAMP_MEETING_TIME,
      BOOTCAMP_WORKSPACE_URL,
    ]) {
      expect(value === null || value.trim() !== "").toBe(true);
    }
  });

  it("points the workspace button at https once it is set", () => {
    if (BOOTCAMP_WORKSPACE_URL === null) return;
    expect(BOOTCAMP_WORKSPACE_URL).toMatch(/^https:\/\//);
  });
});

describe("weekEntry", () => {
  it("finds nothing for an event with no week on it", () => {
    expect(weekEntry(null)).toBeUndefined();
  });

  it("finds nothing for a week the syllabus does not describe", () => {
    expect(weekEntry(999)).toBeUndefined();
  });

  it("finds each week it does describe", () => {
    for (const entry of BOOTCAMP_CURRICULUM) {
      expect(weekEntry(entry.week)).toBe(entry);
    }
  });
});
