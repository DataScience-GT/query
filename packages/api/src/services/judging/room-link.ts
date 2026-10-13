import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The QR code on a judging room's door opens /judge/activate/<linkId>?sig=…
// The signature proves the link came from an organiser's "generate link" and
// was not guessed from a room id. Revoking the link row is what ends it; the
// signature itself never expires.

/** Cookie holding a guest judge's raw session token. Only its sha256 is stored. */
export const JUDGING_GUEST_COOKIE = "query_judging_guest";

/** A guest judge's session lasts one judging day. */
export const GUEST_SESSION_SECONDS = 8 * 3600;

// Mixed into every signature so one minted here can never be replayed as some
// other value keyed from AUTH_SECRET.
const SIGNATURE_DOMAIN = "query/judging/room-link/v1:";

function signingKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Judging room links are signed with it: set AUTH_SECRET in the environment, then generate the link again.",
    );
  }
  return secret;
}

export function signRoomLink(linkId: string): string {
  return createHmac("sha256", signingKey())
    .update(SIGNATURE_DOMAIN + linkId)
    .digest("base64url");
}

/** Constant-time check of a signature from a scanned link. */
export function verifyRoomLink(linkId: string, sig: string): boolean {
  const expected = Buffer.from(signRoomLink(linkId));
  const given = Buffer.from(sig);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** The path a room's QR code points at, relative to the portal origin. */
export function roomLinkPath(linkId: string): string {
  return `/judge/activate/${linkId}?sig=${signRoomLink(linkId)}`;
}

/** A fresh guest session token: 32 random bytes, URL-safe. */
export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores for a guest token. */
export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
