// The Discord tokens kept on a link, so a role can be taken back later. Only
// ever read here and in sync.ts; nothing returns them to a caller.

import { and, eq } from "drizzle-orm";
import { discordLinks, hackathonParticipants } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { readTokens, refreshAccessToken, refusal, safeMessage } from "./api";
import type { DiscordTokens } from "./api";
import type { DiscordConfig } from "./config";
import { openToken, sealToken } from "./token-crypto";

export type LinkRow = typeof discordLinks.$inferSelect;

export type SyncDeps = {
  config: DiscordConfig;
  secret: string;
  doFetch: typeof fetch;
};

/** A token is refreshed this long before it runs out. */
const SKEW_MS = 60_000;

/** The encrypted columns for a token set; all null when there is none. */
export function sealTokens(
  tokens: DiscordTokens | null,
  secret: string,
  userId: string,
) {
  return {
    accessTokenEnc: tokens ? sealToken(tokens.accessToken, secret, userId) : null,
    refreshTokenEnc: tokens?.refreshToken
      ? sealToken(tokens.refreshToken, secret, userId)
      : null,
    tokenExpiresAt: tokens?.expiresAt ?? null,
  };
}

/**
 * Forgets the link: the link row, and the copy on a registration. Used when
 * Discord says the person withdrew the connection, so there is nothing left to
 * keep up to date.
 */
async function dropLink(db: DrizzleDB, row: LinkRow): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(hackathonParticipants)
      .set({
        discordUserId: null,
        discordUsername: null,
        discordLinkedAt: null,
        ramadanRoleOptIn: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hackathonParticipants.userId, row.userId),
          eq(hackathonParticipants.discordUserId, row.discordUserId),
        ),
      );
    await tx
      .delete(discordLinks)
      .where(
        and(
          eq(discordLinks.userId, row.userId),
          eq(discordLinks.discordUserId, row.discordUserId),
        ),
      );
  });
}

type AccessToken =
  | { ok: true; accessToken: string; row: LinkRow }
  | { ok: false; reason: "no_token" | "revoked" | "failed" };

/**
 * A working access token for the link, refreshing and storing the rotated
 * pair when the stored one is near its end (or `force`d, because Discord
 * refused it). `no_token` is a link with none stored, or none that opens: made
 * before tokens were kept, or sealed under a secret since changed. `revoked`
 * is Discord saying the person withdrew the connection; the link is dropped.
 */
export async function accessTokenFor(
  db: DrizzleDB,
  row: LinkRow,
  deps: SyncDeps,
  force = false,
  retried = false,
): Promise<AccessToken> {
  const access = openToken(row.accessTokenEnc, deps.secret, row.userId);
  if (
    !force &&
    access &&
    row.tokenExpiresAt &&
    row.tokenExpiresAt.getTime() - Date.now() > SKEW_MS
  ) {
    return { ok: true, accessToken: access, row };
  }
  const refresh = openToken(row.refreshTokenEnc, deps.secret, row.userId);
  if (!refresh) return { ok: false, reason: "no_token" };

  // A network failure is a refresh that did not happen, not an error to throw:
  // the caller may be inside a transaction that must still commit.
  let res: Response;
  try {
    res = await refreshAccessToken(deps.doFetch, deps.config, refresh);
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn(`[Discord sync] refresh did not reach Discord: ${safeMessage(error)}`);
    return { ok: false, reason: "failed" };
  }
  if (!res.ok) {
    const { status, error } = await refusal("refresh", res);
    if (status === 400 && error === "invalid_grant") {
      // A refresh token is single use: a run that got there first rotated it.
      // Only a token nobody replaced is really dead.
      const [latest] = await db
        .select()
        .from(discordLinks)
        .where(eq(discordLinks.userId, row.userId))
        .limit(1);
      if (
        !retried &&
        latest &&
        latest.discordUserId === row.discordUserId &&
        latest.refreshTokenEnc !== row.refreshTokenEnc
      ) {
        return accessTokenFor(db, latest, deps, force, true);
      }
      await dropLink(db, row);
      return { ok: false, reason: "revoked" };
    }
    return { ok: false, reason: "failed" };
  }

  const tokens = readTokens(await res.json().catch(() => ({})));
  if (!tokens) return { ok: false, reason: "failed" };
  const sealed = sealTokens(
    { ...tokens, refreshToken: tokens.refreshToken ?? refresh },
    deps.secret,
    row.userId,
  );
  await db
    .update(discordLinks)
    .set(sealed)
    .where(
      and(
        eq(discordLinks.userId, row.userId),
        eq(discordLinks.discordUserId, row.discordUserId),
      ),
    );
  return { ok: true, accessToken: tokens.accessToken, row: { ...row, ...sealed } };
}
