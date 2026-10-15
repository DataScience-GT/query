// The evaluation editor's answers, checked the way the desk API checks them,
// so the editor can say what is missing before a round trip does.

export type Answer = { value: string; isPublic: boolean };

export type RubricLine = {
  id: string;
  kind: "rating" | "response";
  label: string;
  required: boolean;
  visibility: "public" | "optional" | "private" | null;
};

/** The answers that belong to the rubric as it stands now. */
export function onRubric<T>(
  answers: Record<string, T>,
  items: readonly Pick<RubricLine, "id">[],
): Record<string, T> {
  const kept: Record<string, T> = {};
  for (const item of items) {
    const value = answers[item.id];
    if (value !== undefined) kept[item.id] = value;
  }
  return kept;
}

/** Items still to answer before a submit: every rating, required responses. */
export function missingItems<T extends RubricLine>(
  rubric: readonly T[],
  ratings: Record<string, number>,
  responses: Record<string, Answer>,
): T[] {
  return rubric.filter((item) =>
    item.kind === "rating"
      ? !ratings[item.id]
      : item.required && !responses[item.id]?.value.trim(),
  );
}

/**
 * The answers as the server would store them, for telling whether an edit
 * changed anything: surrounding spaces are trimmed away, and the share choice
 * only counts where the judge has one.
 */
export function storedForm(
  rubric: readonly RubricLine[],
  ratings: Record<string, number>,
  responses: Record<string, Answer>,
): string {
  return JSON.stringify(
    rubric.map((item) =>
      item.kind === "rating"
        ? (ratings[item.id] ?? null)
        : [
            responses[item.id]?.value.trim() ?? "",
            item.visibility === "optional" &&
              responses[item.id]?.isPublic === true,
          ],
    ),
  );
}
