import { describe, expect, it } from "vitest";
import { missingItems, onRubric, storedForm } from "./answers";
import type { RubricLine } from "./answers";

const rubric: RubricLine[] = [
  {
    id: "impact",
    kind: "rating",
    label: "Impact",
    required: true,
    visibility: null,
  },
  {
    id: "craft",
    kind: "rating",
    label: "Craft",
    required: true,
    visibility: null,
  },
  {
    id: "feedback",
    kind: "response",
    label: "Feedback",
    required: true,
    visibility: "optional",
  },
  {
    id: "notes",
    kind: "response",
    label: "Notes",
    required: false,
    visibility: "private",
  },
];

describe("onRubric", () => {
  it("drops answers to items no longer on the rubric", () => {
    expect(onRubric({ impact: 4, retired: 2 }, rubric)).toEqual({ impact: 4 });
  });
});

describe("missingItems", () => {
  it("lists every unrated item and every blank required response", () => {
    const missing = missingItems(
      rubric,
      { impact: 3 },
      { feedback: { value: "   ", isPublic: true } },
    );
    expect(missing.map((item) => item.id)).toEqual(["craft", "feedback"]);
  });

  it("does not ask for optional responses", () => {
    const missing = missingItems(
      rubric,
      { impact: 3, craft: 5 },
      { feedback: { value: "Clear demo.", isPublic: false } },
    );
    expect(missing).toEqual([]);
  });
});

describe("storedForm", () => {
  const ratings = { impact: 3, craft: 5 };

  it("ignores spaces around a response", () => {
    expect(
      storedForm(rubric, ratings, {
        feedback: { value: "Clear demo.  ", isPublic: false },
      }),
    ).toBe(
      storedForm(rubric, ratings, {
        feedback: { value: "Clear demo.", isPublic: false },
      }),
    );
  });

  it("counts the share choice only where the judge has one", () => {
    const shared = storedForm(rubric, ratings, {
      feedback: { value: "Clear demo.", isPublic: true },
      notes: { value: "Ask about data", isPublic: true },
    });
    const kept = storedForm(rubric, ratings, {
      feedback: { value: "Clear demo.", isPublic: false },
      notes: { value: "Ask about data", isPublic: false },
    });
    const notesOnly = storedForm(rubric, ratings, {
      feedback: { value: "Clear demo.", isPublic: true },
      notes: { value: "Ask about data", isPublic: false },
    });
    expect(shared).not.toBe(kept);
    expect(shared).toBe(notesOnly);
  });

  it("sees a changed rating", () => {
    expect(storedForm(rubric, { impact: 3, craft: 4 }, {})).not.toBe(
      storedForm(rubric, ratings, {}),
    );
  });
});
