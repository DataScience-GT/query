import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GUEST_SESSION_SECONDS,
  JUDGING_GUEST_COOKIE,
  hashGuestToken,
  newGuestToken,
  roomLinkPath,
  signRoomLink,
  verifyRoomLink,
} from "./room-link";

const LINK = "3f1c2b8e-9d4a-4c1e-8f2a-5b6c7d8e9f01";
const OTHER_LINK = "7a2d4e6f-1b3c-4d5e-9f8a-0b1c2d3e4f56";

describe("room links", () => {
  const original = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-for-room-links";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  });

  it("verifies a signature it made", () => {
    expect(verifyRoomLink(LINK, signRoomLink(LINK))).toBe(true);
  });

  it("signs the same link the same way every time", () => {
    expect(signRoomLink(LINK)).toBe(signRoomLink(LINK));
  });

  it("rejects a signature made for another link", () => {
    expect(verifyRoomLink(LINK, signRoomLink(OTHER_LINK))).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const sig = signRoomLink(LINK);
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyRoomLink(LINK, flipped)).toBe(false);
    expect(verifyRoomLink(LINK, sig.slice(1))).toBe(false);
    expect(verifyRoomLink(LINK, "")).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const sig = signRoomLink(LINK);
    process.env.AUTH_SECRET = "a-rotated-secret";
    expect(verifyRoomLink(LINK, sig)).toBe(false);
  });

  it("throws a clear error when AUTH_SECRET is unset", () => {
    delete process.env.AUTH_SECRET;
    expect(() => signRoomLink(LINK)).toThrow(/AUTH_SECRET is not set/);
    expect(() => verifyRoomLink(LINK, "anything")).toThrow(
      /AUTH_SECRET is not set/,
    );
  });

  it("builds the activation path with the signature", () => {
    expect(roomLinkPath(LINK)).toBe(
      `/judge/activate/${LINK}?sig=${signRoomLink(LINK)}`,
    );
  });
});

describe("guest tokens", () => {
  it("makes 32 random bytes, URL-safe", () => {
    const token = newGuestToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(newGuestToken()).not.toBe(token);
  });

  it("hashes to sha256 hex, stable for the same token", () => {
    const token = newGuestToken();
    expect(hashGuestToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestToken(token)).toBe(hashGuestToken(token));
    expect(hashGuestToken(token)).not.toBe(hashGuestToken(newGuestToken()));
  });

  it("names the cookie and an eight-hour session", () => {
    expect(JUDGING_GUEST_COOKIE).toBe("query_judging_guest");
    expect(GUEST_SESSION_SECONDS).toBe(28800);
  });
});
