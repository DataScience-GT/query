import { describe, it, expect } from "vitest";
import { hackathonSlug } from "./hackathon-slug";

describe("hackathonSlug", () => {
  it("turns an edition name into a URL segment", () => {
    expect(hackathonSlug("Hacklytics: Digital Bloom")).toBe(
      "hacklytics-digital-bloom",
    );
    expect(hackathonSlug("Hacklytics 2027")).toBe("hacklytics-2027");
  });

  it("leaves no leading or trailing separators", () => {
    expect(hackathonSlug("  Hacklytics!  ")).toBe("hacklytics");
    expect(hackathonSlug("--Hacklytics--")).toBe("hacklytics");
  });

  it("collapses runs of punctuation into one separator", () => {
    expect(hackathonSlug("Hacklytics -- 2027 // Spring")).toBe(
      "hacklytics-2027-spring",
    );
  });

  it("is idempotent, so a slug in the URL bar re-slugs to itself", () => {
    const once = hackathonSlug("Hacklytics: Digital Bloom");
    expect(hackathonSlug(once)).toBe(once);
  });

  it("returns empty when a name has nothing sluggable, so callers can fall back", () => {
    expect(hackathonSlug("!!!")).toBe("");
    expect(hackathonSlug("")).toBe("");
  });
});
