import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchGitHubProfile, verifiedGitHubEmail } from "./github";

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

describe("fetchGitHubProfile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the profile body on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: 7, login: "octo" })),
    );
    await expect(fetchGitHubProfile({})).resolves.toEqual({
      id: 7,
      login: "octo",
    });
  });

  // A rate-limit body is JSON too; passed along it becomes a profile with no id.
  it("throws on an error status instead of returning its body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "API rate limit exceeded" }, { status: 403 }),
      ),
    );
    await expect(fetchGitHubProfile({})).rejects.toThrow("403");
  });
});
