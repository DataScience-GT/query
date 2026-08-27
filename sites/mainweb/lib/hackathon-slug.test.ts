import { describe, it, expect } from "vitest";
import {
  hackathonSlug,
  decodeHackathonParam,
  hackathonPathSegment,
  adminHackathonPath,
} from "./hackathon-slug";

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

describe("decodeHackathonParam", () => {
  it("undoes the percent-encoding admin dashboard links used to put in the path", () => {
    expect(
      decodeHackathonParam(encodeURIComponent("Hacklytics: Digital Bloom")),
    ).toBe("Hacklytics: Digital Bloom");
  });

  it("undoes a double-encoded name from Next.js Link + encodeURIComponent", () => {
    const name = "Hacklytics: Digital Bloom";
    expect(decodeHackathonParam(encodeURIComponent(encodeURIComponent(name)))).toBe(
      name,
    );
  });

  it("leaves a slug and a raw name alone", () => {
    expect(decodeHackathonParam("hacklytics-digital-bloom")).toBe(
      "hacklytics-digital-bloom",
    );
    expect(decodeHackathonParam("Hacklytics: Digital Bloom")).toBe(
      "Hacklytics: Digital Bloom",
    );
  });

  it("returns the original string when it is not valid percent-encoding", () => {
    expect(decodeHackathonParam("%")).toBe("%");
  });
});

describe("hackathonPathSegment", () => {
  it("uses the slug for a named edition", () => {
    expect(
      hackathonPathSegment("Hacklytics: Digital Bloom", "uuid-bloom"),
    ).toBe("hacklytics-digital-bloom");
  });

  it("falls back to the id when the name has nothing sluggable", () => {
    expect(hackathonPathSegment("!!!", "uuid-bloom")).toBe("uuid-bloom");
  });
});

describe("adminHackathonPath", () => {
  it("builds a slug URL, not an encoded name", () => {
    expect(adminHackathonPath("Hacklytics: Digital Bloom", "uuid-bloom")).toBe(
      "/admin/hackathons/hacklytics-digital-bloom",
    );
    expect(adminHackathonPath("Hacklytics: Digital Bloom", "uuid-bloom")).not.toContain(
      "%",
    );
  });
});
