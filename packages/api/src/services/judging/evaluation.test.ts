import { describe, expect, it } from "vitest";
import {
  checkAnswers,
  isPublicResponse,
  responseVisibility,
  snapshotOf,
} from "./evaluation";
import type { RubricItem } from "./evaluation";

const rubric: RubricItem[] = [
  {
    id: "impact",
    kind: "rating",
    label: "Impact",
    required: true,
    guestVisibility: null,
  },
  {
    id: "craft",
    kind: "rating",
    label: "Craft",
    required: true,
    guestVisibility: null,
  },
  {
    id: "praise",
    kind: "response",
    label: "What worked",
    required: true,
    guestVisibility: "public",
  },
  {
    id: "advice",
    kind: "response",
    label: "What to try next",
    required: false,
    guestVisibility: "optional",
  },
  {
    id: "notes",
    kind: "response",
    label: "Notes for organisers",
    required: false,
    guestVisibility: "private",
  },
];

const full = {
  ratings: { impact: 4, craft: 5 },
  responses: {
    praise: { value: "  Clear demo.  ", isPublic: false },
    advice: { value: "Ship the API.", isPublic: true },
    notes: { value: "Strong team.", isPublic: true },
  },
};

describe("responseVisibility", () => {
  it("shows a member's responses to the team, always", () => {
    expect(responseVisibility({ guestVisibility: "private" }, "member")).toBe(
      "public",
    );
  });

  it("follows the item for guests, private when unset", () => {
    expect(responseVisibility({ guestVisibility: "optional" }, "guest")).toBe(
      "optional",
    );
    expect(responseVisibility({ guestVisibility: null }, "guest")).toBe(
      "private",
    );
  });

  it("lets the judge choose only when optional", () => {
    expect(isPublicResponse("optional", true)).toBe(true);
    expect(isPublicResponse("optional", false)).toBe(false);
    expect(isPublicResponse("public", false)).toBe(true);
    expect(isPublicResponse("private", true)).toBe(false);
  });
});

describe("checkAnswers", () => {
  it("accepts a complete set, trimmed, in rubric order", () => {
    const result = checkAnswers(rubric, full, "guest", "strict");
    expect(result).toEqual({
      ok: true,
      answers: {
        ratings: [
          { itemId: "impact", value: 4 },
          { itemId: "craft", value: 5 },
        ],
        responses: [
          { itemId: "praise", value: "Clear demo.", isPublic: true },
          { itemId: "advice", value: "Ship the API.", isPublic: true },
          { itemId: "notes", value: "Strong team.", isPublic: false },
        ],
        isComplete: true,
        missing: [],
      },
    });
  });

  it("makes every member response public", () => {
    const result = checkAnswers(rubric, full, "member", "strict");
    expect(result.ok && result.answers.responses.every((r) => r.isPublic)).toBe(
      true,
    );
  });

  it("names what is missing: unrated criteria and blank required responses", () => {
    const result = checkAnswers(
      rubric,
      {
        ratings: { impact: 3 },
        responses: { praise: { value: "   ", isPublic: true } },
      },
      "member",
      "strict",
    );
    expect(result).toMatchObject({
      ok: true,
      answers: {
        isComplete: false,
        missing: ["Craft", "What worked"],
        responses: [],
      },
    });
  });

  it("does not need optional responses", () => {
    const result = checkAnswers(
      rubric,
      {
        ratings: { impact: 1, craft: 2 },
        responses: { praise: { value: "Good", isPublic: false } },
      },
      "guest",
      "strict",
    );
    expect(result.ok && result.answers.isComplete).toBe(true);
  });

  it("refuses answers to items that are not on the rubric", () => {
    expect(
      checkAnswers(
        rubric,
        { ratings: { gone: 3 }, responses: {} },
        "member",
        "strict",
      ),
    ).toMatchObject({ ok: false });
    expect(
      checkAnswers(
        rubric,
        { ratings: { praise: 3 }, responses: {} },
        "member",
        "strict",
      ),
    ).toMatchObject({ ok: false });
    expect(
      checkAnswers(
        rubric,
        { ratings: {}, responses: { impact: { value: "x", isPublic: true } } },
        "member",
        "strict",
      ),
    ).toMatchObject({ ok: false });
  });

  it("refuses ratings outside 1–5 or not whole", () => {
    for (const value of [0, 6, 2.5]) {
      expect(
        checkAnswers(
          rubric,
          { ratings: { impact: value }, responses: {} },
          "member",
          "strict",
        ),
      ).toEqual({
        ok: false,
        message: "Ratings are whole numbers from 1 to 5.",
      });
    }
  });

  it("drops what it cannot use when lenient", () => {
    const result = checkAnswers(
      rubric,
      {
        ratings: { impact: 4, craft: 9, gone: 2 },
        responses: { gone: { value: "old question", isPublic: true } },
      },
      "guest",
      "lenient",
    );
    expect(result).toMatchObject({
      ok: true,
      answers: {
        ratings: [{ itemId: "impact", value: 4 }],
        responses: [],
        isComplete: false,
        missing: ["Craft", "What worked"],
      },
    });
  });
});

describe("snapshotOf", () => {
  it("keys the checked answers by item", () => {
    const result = checkAnswers(rubric, full, "guest", "strict");
    if (!result.ok) throw new Error("expected valid answers");
    expect(snapshotOf(result.answers)).toEqual({
      ratings: { impact: 4, craft: 5 },
      responses: {
        praise: { value: "Clear demo.", isPublic: true },
        advice: { value: "Ship the API.", isPublic: true },
        notes: { value: "Strong team.", isPublic: false },
      },
    });
  });
});
