import type { JudgingDraftRatings, JudgingDraftResponses } from "@query/db";

// Checking a judge's answers against the rubric. Pure: the desk runs it on
// every draft save, on submit, and when a draft is submitted for a judge whose
// time ran out.
//
// Ratings are 1–5 and always required. A short response is required or not
// per item, and who may read it depends on the judge: a member judge's
// responses are always shown to the team; a guest's follow the item's guest
// visibility, where "optional" lets the guest choose.

export type Visibility = "public" | "optional" | "private";
export type JudgeKind = "member" | "guest";

/** The columns these checks need from a judging_rubric_item row. */
export type RubricItem = {
  id: string;
  kind: "rating" | "response";
  label: string;
  required: boolean;
  guestVisibility: Visibility | null;
};

export type Answers = {
  ratings: JudgingDraftRatings;
  responses: JudgingDraftResponses;
};

export type CheckedAnswers = {
  ratings: { itemId: string; value: number }[];
  /** Non-blank responses, trimmed, with who may read them decided. */
  responses: { itemId: string; value: string; isPublic: boolean }[];
  isComplete: boolean;
  /** Labels of the items still to answer, in rubric order. */
  missing: string[];
};

export type AnswerCheck =
  { ok: true; answers: CheckedAnswers } | { ok: false; message: string };

/** Who may read a judge's response to `item`. */
export function responseVisibility(
  item: Pick<RubricItem, "guestVisibility">,
  kind: JudgeKind,
): Visibility {
  if (kind === "member") return "public";
  // An item saved without a guest setting is kept from the team rather than
  // shown by accident.
  return item.guestVisibility ?? "private";
}

export function isPublicResponse(visibility: Visibility, requested: boolean) {
  if (visibility === "optional") return requested;
  return visibility === "public";
}

const isRating = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 5;

/**
 * Checks answers against the rubric, in rubric order. `strict` refuses
 * anything that is not on the rubric, which is right for what a judge just
 * sent. Lenient drops it instead: a draft saved under an older rubric is still
 * worth submitting for its judge.
 */
export function checkAnswers(
  rubric: readonly RubricItem[],
  answers: Answers,
  kind: JudgeKind,
  mode: "strict" | "lenient",
): AnswerCheck {
  const byId = new Map(rubric.map((item) => [item.id, item]));

  if (mode === "strict") {
    for (const [itemId, value] of Object.entries(answers.ratings)) {
      if (byId.get(itemId)?.kind !== "rating") return mismatch();
      if (!isRating(value)) {
        return { ok: false, message: "Ratings are whole numbers from 1 to 5." };
      }
    }
    for (const itemId of Object.keys(answers.responses)) {
      if (byId.get(itemId)?.kind !== "response") return mismatch();
    }
  }

  const checked: CheckedAnswers = {
    ratings: [],
    responses: [],
    isComplete: true,
    missing: [],
  };

  for (const item of rubric) {
    if (item.kind === "rating") {
      const value = answers.ratings[item.id];
      if (isRating(value)) {
        checked.ratings.push({ itemId: item.id, value });
      } else {
        checked.missing.push(item.label);
      }
      continue;
    }

    const response = answers.responses[item.id];
    const value =
      typeof response?.value === "string" ? response.value.trim() : "";
    if (value) {
      checked.responses.push({
        itemId: item.id,
        value,
        isPublic: isPublicResponse(
          responseVisibility(item, kind),
          response?.isPublic === true,
        ),
      });
    } else if (item.required) {
      checked.missing.push(item.label);
    }
  }

  checked.isComplete = checked.missing.length === 0;
  return { ok: true, answers: checked };
}

function mismatch(): AnswerCheck {
  return {
    ok: false,
    message:
      "These answers do not match the current rubric. Reload the page to get the latest questions.",
  };
}

/** The answers as a revision snapshot stores them. */
export function snapshotOf(checked: CheckedAnswers): Answers {
  return {
    ratings: Object.fromEntries(
      checked.ratings.map((rating) => [rating.itemId, rating.value]),
    ),
    responses: Object.fromEntries(
      checked.responses.map((response) => [
        response.itemId,
        { value: response.value, isPublic: response.isPublic },
      ]),
    ),
  };
}
