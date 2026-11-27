// The few Discord HTTP calls the link and the role sync share.

import type { DiscordConfig } from "./config";
import type { RoleMetadata } from "./roles";

export const API = "https://discord.com/api/v10";

/** Past this a sync gives up, so a slow Discord cannot hold an admin's click. */
const TIMEOUT_MS = 8_000;

export type LinkErrorReason =
  | "not_accepted"
  | "bad_code"
  | "rate_limited"
  | "discord_denied"
  | "discord_error"
  | "already_linked";

export function failureFor(status: number): LinkErrorReason {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "discord_denied";
  return "discord_error";
}

/**
 * A refused Discord call: logs the step, status and Discord's error body (never
 * a token; the bodies of failed calls carry only an error code and message),
 * and reads `retry_after` and `error` from the same body.
 */
export async function refusal(
  step: "token" | "me" | "role-connection" | "refresh",
  res: Response,
): Promise<{ status: number; retryAfter?: number; error?: string }> {
  const text = await res.text().catch(() => "");
  // Deliberate operational logging: the only trace of why a call failed.
  // oxlint-disable-next-line no-console
  console.warn(`[Discord link] ${step} refused: ${res.status} ${text.slice(0, 300)}`);
  let retryAfter: number | undefined;
  let error: string | undefined;
  try {
    const body = JSON.parse(text) as { retry_after?: number; error?: unknown };
    if (res.status === 429 && typeof body.retry_after === "number") {
      retryAfter = Math.ceil(body.retry_after);
    }
    if (typeof body.error === "string") error = body.error;
  } catch {
    // No JSON body: nothing more to read.
  }
  return { status: res.status, retryAfter, error };
}

/** What Discord hands back for a code or a refresh token. */
export type DiscordTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

export function readTokens(
  body: { access_token?: string; refresh_token?: string; expires_in?: number },
  now = Date.now(),
): DiscordTokens | null {
  if (!body.access_token) return null;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt:
      typeof body.expires_in === "number"
        ? new Date(now + body.expires_in * 1000)
        : null,
  };
}

/** Publishes the person's Linked Roles metadata with their own token. */
export function putRoleConnection(
  doFetch: typeof fetch,
  config: DiscordConfig,
  accessToken: string,
  platformUsername: string,
  metadata: RoleMetadata,
) {
  return doFetch(
    `${API}/users/@me/applications/${config.clientId}/role-connection`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform_name: "Hacklytics",
        platform_username: platformUsername,
        metadata,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
}

/** Trades a refresh token for a new access token (and a rotated refresh token). */
export function refreshAccessToken(
  doFetch: typeof fetch,
  config: DiscordConfig,
  refreshToken: string,
) {
  return doFetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}
