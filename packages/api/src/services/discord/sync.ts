// Keeping what Discord holds in step with what the site knows. Roles come from
// Linked Roles metadata, which only the person's own token can change, so the
// token kept at link time (tokens.ts) is what lets a removed judge, an ended
// volunteer term, a withdrawn hacker or an unlink actually take the role back.
// A link made before tokens were kept has none, and cannot be revoked here.

import { and, eq, inArray, like, lte, or } from "drizzle-orm";
import { admins, discordLinks, hackathonParticipants } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { putRoleConnection, refusal } from "./api";
import { discordConfig, discordTokenSecret } from "./config";
import {
  discordContext,
  hackerPayload,
  hasDiscordRole,
  roleMetadata,
  roleSignature,
  ZERO_METADATA,
} from "./roles";
import type { RoleMetadata } from "./roles";
import { accessTokenFor } from "./tokens";
import type { LinkRow, SyncDeps } from "./tokens";

export type SyncOptions = {
  /** Defaults to the app's Discord settings; null means the feature is off. */
  config?: SyncDeps["config"] | null;
  /** Defaults to AUTH_SECRET. */
  secret?: string | null;
  fetchImpl?: typeof fetch;
};

export type SyncResult =
  | "synced"
  | "unchanged"
  | "off"
  | "unlinked"
  | "no_token"
  | "revoked"
  | "failed";

/** How many people one batch call or one daily run will touch. */
export const SYNC_BATCH = 100;
export const EXPIRED_BATCH = 25;

function depsFrom(options: SyncOptions): SyncDeps | null {
  const config =
    options.config === undefined ? discordConfig() : options.config;
  const secret =
    options.secret === undefined ? discordTokenSecret() : options.secret;
  if (!config || !secret) return null;
  return { config, secret, doFetch: options.fetchImpl ?? fetch };
}

// A Drizzle error's message carries the statement's parameters; keep to the part
// before them, so no stored value reaches a log.
const safeMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .split("params:")[0]!
    .slice(0, 300);

/**
 * Puts the metadata on Discord with the link's token. A refused access token
 * is refreshed once and tried again.
 */
async function publish(
  db: DrizzleDB,
  link: LinkRow,
  deps: SyncDeps,
  metadata: RoleMetadata,
): Promise<"published" | "no_token" | "revoked" | "failed"> {
  let row = link;
  for (const force of [false, true]) {
    const token = await accessTokenFor(db, row, deps, force);
    if (!token.ok) return token.reason;
    row = token.row;
    const res = await putRoleConnection(
      deps.doFetch,
      deps.config,
      token.accessToken,
      row.discordUsername,
      metadata,
    );
    if (res.ok) return "published";
    const { status } = await refusal("role-connection", res);
    if (status !== 401 || force) return "failed";
  }
  return "failed";
}

/**
 * Clears every role the link published. Used before the link is unlinked or
 * replaced by another Discord account. `no_token` and `revoked` mean there is
 * nothing more this site can do for that account; `failed` means it could not
 * be reached and the caller should not go on.
 */
export async function zeroDiscordRoles(
  db: DrizzleDB,
  link: LinkRow,
  options: SyncOptions = {},
): Promise<"cleared" | "off" | "no_token" | "revoked" | "failed"> {
  const deps = depsFrom(options);
  if (!deps) return "off";
  if (link.rolesSig === roleSignature(ZERO_METADATA)) return "cleared";
  const result = await publish(db, link, deps, ZERO_METADATA);
  return result === "published" ? "cleared" : result;
}

async function syncOne(
  db: DrizzleDB,
  userId: string,
  deps: SyncDeps,
): Promise<SyncResult> {
  const [link] = await db
    .select()
    .from(discordLinks)
    .where(eq(discordLinks.userId, userId))
    .limit(1);
  if (!link) return "unlinked";

  // The same edition the link flow would pick, so a sync and a fresh link
  // publish the same thing.
  const context = await discordContext(db, userId, null);
  const metadata =
    context && hasDiscordRole(context.roles)
      ? roleMetadata(context.roles, await hackerPayload(db, context, null))
      : ZERO_METADATA;
  const signature = roleSignature(metadata);
  if (link.rolesSig === signature) return "unchanged";

  const result = await publish(db, link, deps, metadata);
  if (result !== "published") return result;
  await db
    .update(discordLinks)
    .set({ rolesSig: signature })
    .where(
      and(
        eq(discordLinks.userId, userId),
        eq(discordLinks.discordUserId, link.discordUserId),
      ),
    );
  return "synced";
}

/**
 * Re-derives what the person holds now and publishes it, or all zeros when
 * they hold nothing. Call it after the change that could revoke or grant a
 * role has committed. Never throws: the change has already happened, and the
 * only record that Discord was not updated is the log, the same as
 * autoAssignFoodGroups.
 */
export async function syncDiscordRoles(
  db: DrizzleDB,
  userId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const deps = depsFrom(options);
  if (!deps) return "off";
  try {
    return await syncOne(db, userId, deps);
  } catch (error) {
    // Deliberate operational logging: the only record that Discord kept a role
    // it should have lost.
    // oxlint-disable-next-line no-console
    console.error(`[Discord sync] failed for user ${userId}: ${safeMessage(error)}`);
    return "failed";
  }
}

/**
 * The same for many people (a batch status change, a ban). Only people with a
 * link are touched, a few at a time, and at most SYNC_BATCH of them.
 */
export async function syncDiscordRolesFor(
  db: DrizzleDB,
  userIds: readonly string[],
  options: SyncOptions = {},
): Promise<void> {
  if (!depsFrom(options) || userIds.length === 0) return;
  try {
    const linked = await db
      .select({ userId: discordLinks.userId })
      .from(discordLinks)
      .where(inArray(discordLinks.userId, [...new Set(userIds)]))
      .limit(SYNC_BATCH);
    for (let i = 0; i < linked.length; i += 5) {
      await Promise.all(
        linked
          .slice(i, i + 5)
          .map(({ userId }) => syncDiscordRoles(db, userId, options)),
      );
    }
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error(`[Discord sync] batch failed: ${safeMessage(error)}`);
  }
}

/**
 * The daily sweep for the one change that has no event: a volunteer's term
 * running out. Volunteers whose published `volunteer` is still 1 although
 * their tier has expired or been switched off are synced, which zeroes it.
 * Capped, and a person drops out of the query once their sync lands.
 */
export async function syncExpiredDiscordRoles(
  db: DrizzleDB,
  options: SyncOptions = {},
): Promise<{ checked: number; synced: number }> {
  if (!depsFrom(options)) return { checked: 0, synced: 0 };
  try {
    const rows = await db
      .select({ userId: discordLinks.userId })
      .from(discordLinks)
      .innerJoin(admins, eq(admins.userId, discordLinks.userId))
      .where(
        and(
          eq(admins.role, "volunteer"),
          or(lte(admins.expiresAt, new Date()), eq(admins.isActive, false)),
          like(discordLinks.rolesSig, "%v1"),
        ),
      )
      .limit(EXPIRED_BATCH);
    let synced = 0;
    for (const { userId } of rows) {
      if ((await syncDiscordRoles(db, userId, options)) === "synced") synced++;
    }
    return { checked: rows.length, synced };
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error(`[Discord sync] expired sweep failed: ${safeMessage(error)}`);
    return { checked: 0, synced: 0 };
  }
}

/**
 * Unlinks: clears the roles on Discord with the stored token, then forgets the
 * link (and the copy on this edition's registration). `failed` means Discord
 * could not be reached to clear them, and nothing was deleted, so the person
 * is not left holding roles the site can no longer take back. A link with no
 * stored token is deleted regardless: there is nothing to clear it with.
 */
export async function unlinkDiscord(
  db: DrizzleDB,
  userId: string,
  hackathonId: string,
  options: SyncOptions = {},
): Promise<"unlinked" | "failed"> {
  try {
    const [link] = await db
      .select()
      .from(discordLinks)
      .where(eq(discordLinks.userId, userId))
      .limit(1);
    if (link && (await zeroDiscordRoles(db, link, options)) === "failed") {
      return "failed";
    }
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error(`[Discord sync] unlink failed for user ${userId}: ${safeMessage(error)}`);
    return "failed";
  }
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
          eq(hackathonParticipants.hackathonId, hackathonId),
          eq(hackathonParticipants.userId, userId),
        ),
      );
    await tx.delete(discordLinks).where(eq(discordLinks.userId, userId));
  });
  return "unlinked";
}
