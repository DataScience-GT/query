import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** What the signed OAuth `state` carries. */
export type DiscordState = {
  /** user id */
  u: string;
  /** hackathon id */
  h: string;
  /** Ramadan opt-in: 1, 0, or null to keep what is stored. */
  r: 0 | 1 | null;
  /** Where to land after success: the server invite, or back in the portal. */
  t: "invite" | "portal";
  /** nonce */
  n: string;
  /** expiry, ms since epoch */
  e: number;
};

export const STATE_TTL_MS = 10 * 60 * 1000;

const mac = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");

export function signState(
  input: Omit<DiscordState, "n" | "e">,
  secret: string,
  now = Date.now(),
): string {
  const payload: DiscordState = {
    ...input,
    n: randomBytes(12).toString("base64url"),
    e: now + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** The payload if the signature, expiry and (optional) user all hold; else null. */
export function verifyState(
  token: string | null | undefined,
  secret: string,
  opts: { now?: number; userId?: string } = {},
): DiscordState | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(body, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  let payload: DiscordState;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload?.e !== "number" || payload.e < (opts.now ?? Date.now())) {
    return null;
  }
  if (typeof payload.h !== "string" || typeof payload.u !== "string") {
    return null;
  }
  if (opts.userId !== undefined && payload.u !== opts.userId) return null;
  return payload;
}
