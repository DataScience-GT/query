import { describe, expect, it } from "vitest";
import { CODES_BUSY, emailSignInProblem } from "./email-sign-in";

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
