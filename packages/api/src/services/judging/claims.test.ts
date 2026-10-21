import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TEAM_SIZE,
  claimLinkPath,
  claimLinkUsable,
  decideClaim,
  decideInvite,
  newClaimToken,
  portalOrigin,
  sameEmail,
  teamSize,
} from "./claims";

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const now = new Date("2027-02-08T15:00:00Z");
const later = new Date("2027-02-09T18:00:00Z");
const earlier = new Date("2027-02-07T09:00:00Z");

describe("teamSize", () => {
  it("takes the larger of Devpost's count and the roster", () => {
    expect(teamSize(3, 2)).toBe(3);
    expect(teamSize(2, 4)).toBe(4);
    expect(teamSize(4, 4)).toBe(MAX_TEAM_SIZE);
  });
});

describe("sameEmail", () => {
  it("ignores case and surrounding space", () => {
    expect(sameEmail(" Ada@Example.com", "ada@example.com ")).toBe(true);
    expect(sameEmail("ada@example.com", "ada@example.org")).toBe(false);
  });
});

describe("newClaimToken", () => {
  it("is 32 random bytes in URL-safe base64", () => {
    const token = newClaimToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newClaimToken()).not.toBe(token);
  });
});

describe("claimLinkPath", () => {
  it("points at the edition's claim page and escapes the token", () => {
    expect(claimLinkPath(HACK, "abc")).toBe(
      `/hackathons/${HACK}/claim?token=abc`,
    );
    expect(claimLinkPath(HACK, "a+b/c")).toBe(
      `/hackathons/${HACK}/claim?token=a%2Bb%2Fc`,
    );
  });
});

describe("portalOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the auth URL without a trailing slash", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://portal.example.org/");
    expect(portalOrigin()).toBe("https://portal.example.org");
  });

  it("falls back to the public site", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("AUTH_URL", "");
    expect(portalOrigin()).toBe("https://datasciencegt.org");
  });
});

describe("claimLinkUsable", () => {
  const live = { token: "t", consumedAt: null, expiresAt: later };

  it("accepts an unused link before the event ends", () => {
    expect(claimLinkUsable(live, later, now)).toBe(true);
  });

  it("refuses a used link", () => {
    expect(claimLinkUsable({ ...live, token: null }, later, now)).toBe(false);
    expect(claimLinkUsable({ ...live, consumedAt: earlier }, later, now)).toBe(
      false,
    );
  });

  it("refuses once the link or the event has ended", () => {
    expect(claimLinkUsable({ ...live, expiresAt: now }, later, now)).toBe(
      false,
    );
    // The end date was moved earlier after the link went out.
    expect(claimLinkUsable(live, earlier, now)).toBe(false);
  });
});

describe("decideClaim", () => {
  const open = { userId: null, entryDeleted: false, teamSize: 3 };

  it("lets a hacker take an open place", () => {
    expect(decideClaim(open, "u1", null)).toEqual({
      ok: true,
      alreadyYours: false,
    });
  });

  it("treats a repeat claim of the same place as done", () => {
    expect(decideClaim({ ...open, userId: "u1" }, "u1", null)).toEqual({
      ok: true,
      alreadyYours: true,
    });
  });

  it("refuses a missing or pulled project", () => {
    expect(decideClaim(null, "u1", null)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      decideClaim({ ...open, entryDeleted: true }, "u1", null),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("refuses a place someone else holds", () => {
    expect(decideClaim({ ...open, userId: "u2" }, "u1", null)).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
  });

  it("allows one project per person, naming the one they hold", () => {
    const decision = decideClaim(open, "u1", "Tide Pool");
    expect(decision).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(!decision.ok && decision.message).toContain("Tide Pool");
  });

  it("blocks teams over four", () => {
    expect(decideClaim({ ...open, teamSize: 4 }, "u1", null)).toMatchObject({
      ok: true,
    });
    expect(decideClaim({ ...open, teamSize: 5 }, "u1", null)).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("decideInvite", () => {
  const ready = { checkedIn: true, heldProject: null };

  it("adds a checked-in hacker with no project to a team with room", () => {
    expect(decideInvite({ teamSize: 3, invitee: ready, listed: null })).toEqual(
      { action: "add" },
    );
  });

  it("resends to someone already listed who has not claimed", () => {
    expect(
      decideInvite({ teamSize: 4, invitee: ready, listed: { claimed: false } }),
    ).toEqual({ action: "resend" });
  });

  it("says when they are already on the team", () => {
    expect(
      decideInvite({ teamSize: 2, invitee: ready, listed: { claimed: true } }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(
      decideInvite({
        teamSize: 2,
        invitee: { checkedIn: true, heldProject: "this" },
        listed: null,
      }),
    ).toMatchObject({ ok: false, message: "They are already on your team." });
  });

  it("gives one answer for no account, not checked in and another team", () => {
    const answers = [
      decideInvite({ teamSize: 2, invitee: null, listed: null }),
      decideInvite({
        teamSize: 2,
        invitee: { checkedIn: false, heldProject: null },
        listed: null,
      }),
      decideInvite({
        teamSize: 2,
        invitee: { checkedIn: true, heldProject: "other" },
        listed: null,
      }),
    ];
    for (const answer of answers) {
      expect(answer).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    }
    expect(
      new Set(answers.map((a) => ("message" in a ? a.message : ""))).size,
    ).toBe(1);
  });

  it("stops at four, counting places not yet claimed", () => {
    expect(
      decideInvite({ teamSize: 4, invitee: ready, listed: null }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});
