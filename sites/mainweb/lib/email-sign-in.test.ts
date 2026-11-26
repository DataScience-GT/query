import { describe, expect, it } from "vitest";
import {
  CODES_BUSY,
  CODES_PAUSED,
  emailSignInProblem,
  linkOnlySent,
} from "./email-sign-in";

const both = { discord: true, inAppBrowser: false };

describe("emailSignInProblem", () => {
  it("is nothing when the code went out", () => {
    expect(emailSignInProblem({ ok: true }, both)).toBeNull();
  });

  it("says codes are busy, never that one was sent, and offers the other ways in", () => {
    const message = emailSignInProblem({ ok: false, error: CODES_BUSY }, both);
    expect(message).toMatch(/busy/i);
    expect(message).toMatch(/Google or Discord/);
    expect(message).not.toMatch(/\bsent\b/i);
  });

  it("offers only Google when Discord is not set up", () => {
    const message = emailSignInProblem(
      { ok: false, error: CODES_BUSY },
      { discord: false, inAppBrowser: false },
    );
    expect(message).toMatch(/Google/);
    expect(message).not.toMatch(/Discord/);
  });

  it("does not offer Google inside an app's browser, where it is blocked", () => {
    const withDiscord = emailSignInProblem(
      { ok: false, error: CODES_BUSY },
      { discord: true, inAppBrowser: true },
    );
    expect(withDiscord).toMatch(/Discord/);
    expect(withDiscord).not.toMatch(/continue with Google/);

    const alone = emailSignInProblem(
      { ok: false, error: CODES_BUSY },
      { discord: false, inAppBrowser: true },
    );
    expect(alone).toMatch(/Safari or Chrome/);
  });

  it("keeps the old message for any other failure", () => {
    for (const res of [
      undefined,
      { ok: false, error: "EmailSignin" },
      { ok: true, error: "x" },
    ]) {
      expect(emailSignInProblem(res, both)).toMatch(/couldn't send a code/);
    }
  });
});

describe("linkOnlySent", () => {
  it("is true when the route says a link went out, not a code", () => {
    expect(
      linkOnlySent({
        ok: true,
        url: `https://query.example/login?notice=${CODES_PAUSED}`,
      }),
    ).toBe(true);
  });

  it("is false for an ordinary send, a failure, or no answer", () => {
    expect(linkOnlySent({ ok: true, url: "https://query.example/verify" })).toBe(false);
    expect(linkOnlySent({ ok: true })).toBe(false);
    expect(
      linkOnlySent({
        ok: false,
        error: CODES_BUSY,
        url: `https://query.example/login?notice=${CODES_PAUSED}`,
      }),
    ).toBe(false);
    expect(linkOnlySent(undefined)).toBe(false);
  });

  it("does not count a problem with the send as a link", () => {
    expect(emailSignInProblem({ ok: true, url: `https://x/login?notice=${CODES_PAUSED}` }, { discord: false, inAppBrowser: false })).toBeNull();
  });
});
