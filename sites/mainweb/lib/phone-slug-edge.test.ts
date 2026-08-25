import { describe, it, expect } from "vitest";
import { phoneDigits, normalizePhone, formatPhoneAsTyped } from "./phone";
import { hackathonSlug } from "./hackathon-slug";

/**
 * Both helpers take whatever an applicant types into a form, so the cases that
 * matter are the messy ones: pasted numbers carrying punctuation, international
 * dialling codes, and event names with colons and em dashes in them.
 */

describe("phoneDigits", () => {
  it("keeps only digits", () => {
    expect(phoneDigits("(404) 555-0199")).toBe("4045550199");
  });

  it("drops a leading plus", () => {
    expect(phoneDigits("+14045550199")).toBe("14045550199");
  });

  it("drops letters and punctuation", () => {
    expect(phoneDigits("404-CALL-now")).toBe("404");
  });

  it("returns empty for a string with no digits", () => {
    expect(phoneDigits("no digits here")).toBe("");
  });

  it("returns empty for an empty string", () => {
    expect(phoneDigits("")).toBe("");
  });

  it("keeps digits from a non-Latin numeral context", () => {
    expect(phoneDigits("tel: 404 555 0199 ext 7")).toBe("40455501997");
  });
});

describe("normalizePhone", () => {
  it("adds the US country code to ten bare digits", () => {
    expect(normalizePhone("4045550199")).toBe("+14045550199");
  });

  it("normalises a formatted US number", () => {
    expect(normalizePhone("(404) 555-0199")).toBe("+14045550199");
  });

  it("normalises a dotted US number", () => {
    expect(normalizePhone("404.555.0199")).toBe("+14045550199");
  });

  it("keeps an eleven-digit number that already starts with 1", () => {
    expect(normalizePhone("14045550199")).toBe("+14045550199");
  });

  it("keeps an explicit international number", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("respects a leading plus even after whitespace", () => {
    expect(normalizePhone("  +442079460958")).toBe("+442079460958");
  });

  it("returns empty when there are no digits at all", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("abc")).toBe("");
  });

  /** A lone plus carries no number, so it must not normalise to a bare "+". */
  it("returns empty for a lone plus", () => {
    expect(normalizePhone("+")).toBe("");
  });

  it("prefixes a too-short number rather than inventing digits", () => {
    expect(normalizePhone("5550199")).toBe("+5550199");
  });

  it("prefixes an eleven-digit number that does not start with 1", () => {
    expect(normalizePhone("44207946095")).toBe("+44207946095");
  });

  it("is idempotent on its own output", () => {
    const once = normalizePhone("(404) 555-0199");
    expect(normalizePhone(once)).toBe(once);
  });
});

describe("formatPhoneAsTyped", () => {
  it("shows nothing for no digits", () => {
    expect(formatPhoneAsTyped("")).toBe("");
    expect(formatPhoneAsTyped("abc")).toBe("");
  });

  it("opens the bracket on the first digits", () => {
    expect(formatPhoneAsTyped("4")).toBe("(4");
    expect(formatPhoneAsTyped("404")).toBe("(404");
  });

  it("closes the area code and starts the exchange", () => {
    expect(formatPhoneAsTyped("4045")).toBe("(404) 5");
    expect(formatPhoneAsTyped("404555")).toBe("(404) 555");
  });

  it("adds the final hyphen group", () => {
    expect(formatPhoneAsTyped("4045550")).toBe("(404) 555-0");
    expect(formatPhoneAsTyped("4045550199")).toBe("(404) 555-0199");
  });

  it("shows the country code for an eleven-digit US number", () => {
    expect(formatPhoneAsTyped("14045550199")).toBe("+1 (404) 555-0199");
  });

  it("leaves an explicitly international number plain", () => {
    expect(formatPhoneAsTyped("+442079460958")).toBe("+442079460958");
  });

  /** Longer than a US number with its country code, so it cannot be US. */
  it("treats more than eleven digits as international", () => {
    expect(formatPhoneAsTyped("442079460958")).toBe("+442079460958");
  });

  it("reformats an already-formatted number without drift", () => {
    const once = formatPhoneAsTyped("4045550199");
    expect(formatPhoneAsTyped(once)).toBe(once);
  });

  it("ignores punctuation the user pastes in", () => {
    expect(formatPhoneAsTyped("(404)555-0199")).toBe("(404) 555-0199");
  });
});

describe("hackathonSlug", () => {
  it("lowercases and hyphenates a title", () => {
    expect(hackathonSlug("Hacklytics: Digital Bloom")).toBe(
      "hacklytics-digital-bloom",
    );
  });

  it("collapses a run of punctuation into one hyphen", () => {
    expect(hackathonSlug("Hacklytics --- 2027")).toBe("hacklytics-2027");
  });

  it("trims leading and trailing hyphens", () => {
    expect(hackathonSlug("!!Hacklytics!!")).toBe("hacklytics");
  });

  it("keeps digits", () => {
    expect(hackathonSlug("Hacklytics 2027")).toBe("hacklytics-2027");
  });

  it("drops accents rather than keeping them raw", () => {
    // Not in [a-z0-9], so the accented letter becomes a separator.
    expect(hackathonSlug("Café Hack")).toBe("caf-hack");
  });

  it("returns empty for a name with nothing sluggable", () => {
    expect(hackathonSlug("!!!")).toBe("");
    expect(hackathonSlug("")).toBe("");
  });

  it("handles an em dash the same as any other punctuation", () => {
    expect(hackathonSlug("Hacklytics — Bloom")).toBe("hacklytics-bloom");
  });

  it("collapses inner whitespace runs", () => {
    expect(hackathonSlug("Hacklytics    Bloom")).toBe("hacklytics-bloom");
  });

  it("is idempotent on its own output", () => {
    const once = hackathonSlug("Hacklytics: Digital Bloom");
    expect(hackathonSlug(once)).toBe(once);
  });
});
