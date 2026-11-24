import { describe, expect, it } from "vitest";
import { firstParagraph } from "./first-paragraph";

describe("firstParagraph", () => {
  it("takes the text before the first blank line", () => {
    expect(firstParagraph("Intro line.\n\nMore detail.\n\nEven more.")).toBe(
      "Intro line.",
    );
  });

  it("keeps a single paragraph whole", () => {
    expect(firstParagraph("One paragraph only.")).toBe("One paragraph only.");
  });

  it("returns null for nothing", () => {
    expect(firstParagraph(null)).toBeNull();
    expect(firstParagraph("   ")).toBeNull();
  });
});
