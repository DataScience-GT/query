import { describe, it, expect } from "vitest";
import {
  MAX_RESUME_BOOK_IDS,
  parseResumeBookIds,
  searchNeedle,
} from "./resume-list";

describe("searchNeedle", () => {
  it("strips LIKE wildcards so a search cannot match everyone", () => {
    expect(searchNeedle("%")).toBeUndefined();
    expect(searchNeedle("_")).toBeUndefined();
    expect(searchNeedle("100%")).toBe("100");
    expect(searchNeedle("C++")).toBe("C++");
  });

  it("collapses leftover whitespace after stripping", () => {
    expect(searchNeedle("Ada % Lovelace")).toBe("Ada Lovelace");
  });
});

describe("parseResumeBookIds", () => {
  it("dedupes and drops empties", () => {
    expect(parseResumeBookIds("a,,a, b")).toEqual(["a", "b"]);
  });

  it("caps the list so a query string cannot ask for thousands", () => {
    const raw = Array.from({ length: MAX_RESUME_BOOK_IDS + 50 }, (_, i) => `u${i}`).join(
      ",",
    );
    expect(parseResumeBookIds(raw)).toHaveLength(MAX_RESUME_BOOK_IDS);
  });

  it("treats a missing param as no filter", () => {
    expect(parseResumeBookIds(null)).toBeUndefined();
    expect(parseResumeBookIds("")).toBeUndefined();
  });
});
