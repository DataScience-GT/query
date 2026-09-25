import { describe, expect, it } from "vitest";
import { verifiedGitHubEmail } from "./github";

describe("verifiedGitHubEmail", () => {
  it("takes the primary address when it is verified", () => {
    expect(
      verifiedGitHubEmail([
        { email: "other@x.co", primary: false, verified: true },
        { email: "main@x.co", primary: true, verified: true },
      ]),
    ).toBe("main@x.co");
  });

  // The takeover: an unverified address someone else owns, set as primary.
  it("never takes an unverified primary", () => {
    expect(
      verifiedGitHubEmail([
        { email: "victim@gatech.edu", primary: true, verified: false },
        { email: "attacker@x.co", primary: false, verified: true },
      ]),
    ).toBe("attacker@x.co");
  });

  it("returns nothing when no address is verified", () => {
    expect(
      verifiedGitHubEmail([
        { email: "victim@gatech.edu", primary: true, verified: false },
      ]),
    ).toBeNull();
    expect(verifiedGitHubEmail([])).toBeNull();
  });
});
