import { describe, expect, it } from "vitest";
import { groupSections, isReordering, nextOrder } from "./deliberation";

describe("isReordering", () => {
  it("accepts the same ids in any order", () => {
    expect(isReordering(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(isReordering([], [])).toBe(true);
  });

  it("refuses a list missing a row or naming an extra one", () => {
    expect(isReordering(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(isReordering(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(isReordering(["a", "b"], ["a", "x"])).toBe(false);
  });

  it("refuses a repeated id", () => {
    expect(isReordering(["a", "b"], ["a", "a"])).toBe(false);
  });
});

describe("nextOrder", () => {
  it("starts at zero and goes one past the highest", () => {
    expect(nextOrder([])).toBe(0);
    expect(nextOrder([0, 1, 2])).toBe(3);
    expect(nextOrder([4, 0, 7])).toBe(8);
  });
});

describe("groupSections", () => {
  it("nests entries under their section, both in display order", () => {
    const grouped = groupSections(
      [
        { id: "maybe", displayOrder: 1 },
        { id: "top", displayOrder: 0 },
        { id: "empty", displayOrder: 2 },
      ],
      [
        { id: "e1", sectionId: "top", displayOrder: 1 },
        { id: "e2", sectionId: "maybe", displayOrder: 0 },
        { id: "e3", sectionId: "top", displayOrder: 0 },
      ],
    );
    expect(grouped.map((s) => [s.id, s.entries.map((e) => e.id)])).toEqual([
      ["top", ["e3", "e1"]],
      ["maybe", ["e2"]],
      ["empty", []],
    ]);
  });

  it("keeps input order for ties and leaves the input alone", () => {
    const sections = [
      { id: "b", displayOrder: 0 },
      { id: "a", displayOrder: 0 },
    ];
    expect(groupSections(sections, []).map((s) => s.id)).toEqual(["b", "a"]);
    expect(sections.map((s) => s.id)).toEqual(["b", "a"]);
  });
});
