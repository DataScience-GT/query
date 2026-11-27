import { and, eq, ne } from "drizzle-orm";
import { discordLinks, hackathonParticipants } from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  API,
  failureFor,
  putRoleConnection,
  readTokens,
  refusal,
} from "./api";
import type { LinkErrorReason } from "./api";
import type { DiscordConfig } from "./config";
import {
  discordContext,
  hackerPayload,
  hasDiscordRole,
  roleMetadata,
  roleSignature,
} from "./roles";
import type { DiscordParticipant } from "./roles";
import type { DiscordState } from "./state";
import { zeroDiscordRoles } from "./sync";
import { sealTokens } from "./tokens";
import { isUniqueViolation } from "../../middleware/db-errors";

type HackathonRef = { id: string; name: string };

/**
 * Where the person goes back to: the hackathon page for a hacker, the judge
 * page for a judge, the check-in desk for a volunteer. Each is where that
 * role's Discord card lives.
 */
export type LinkHome = "hackathon" | "judge" | "scan";

type LinkResult =
  | {
      ok: true;
      then: DiscordState["t"];
      hackathon: HackathonRef;
      home: LinkHome;
      username: string;
    }
  | {
      ok: false;
      reason: LinkErrorReason;
      hackathon?: HackathonRef;
      home?: LinkHome;
      retryAfter?: number;
    };

/**
 * The edition a connect request is for, with what the person holds there.
 * With a hackathon id, that one; without (Discord's Linked Roles verification
 * URL sends none), the newest edition that is not cancelled or over in which
 * they hold a role. Null when they hold none: not a confirmed hacker, an
 * approved judge or a volunteer.
 */
export async function resolveConnectTarget(
  db: DrizzleDB,
  userId: string,
  hackathonId: string | null,
) {
  const context = await discordContext(db, userId, hackathonId);
  return context && hasDiscordRole(context.roles) ? context : null;
}

/**
 * The Discord account stored for this person: the one on their participant
 * row (where hackers linked before judges and volunteers could), else their
 * own link row.
 */
export async function storedLink(
  db: DrizzleDB,
  userId: string,
  participant: Pick<
    DiscordParticipant,
    "discordUsername" | "discordLinkedAt"
  > | null,
): Promise<{ username: string; linkedAt: Date } | null> {
  if (participant?.discordLinkedAt && participant.discordUsername) {
    return {
      username: participant.discordUsername,
      linkedAt: participant.discordLinkedAt,
    };
  }
  const [row] = await db
    .select({
      username: discordLinks.discordUsername,
      linkedAt: discordLinks.linkedAt,
    })
    .from(discordLinks)
    .where(eq(discordLinks.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Whether somebody else already holds this Discord account, in either store. */
async function heldByAnother(
  db: DrizzleDB,
  discordUserId: string,
  userId: string,
  hackathonId: string,
): Promise<boolean> {
  const [link] = await db
    .select({ id: discordLinks.id })
    .from(discordLinks)
    .where(
      and(
        eq(discordLinks.discordUserId, discordUserId),
        ne(discordLinks.userId, userId),
      ),
    )
    .limit(1);
  if (link) return true;
  const [participant] = await db
    .select({ id: hackathonParticipants.id })
    .from(hackathonParticipants)
    .where(
      and(
        eq(hackathonParticipants.hackathonId, hackathonId),
        eq(hackathonParticipants.discordUserId, discordUserId),
        ne(hackathonParticipants.userId, userId),
      ),
    )
    .limit(1);
  return !!participant;
}

/**
 * The callback, after the route has checked the state and session. Exchanges
 * the code, reads the account, stores the link and the person's tokens
 * (encrypted, so a role can be taken back later), then publishes the Linked
 * Roles metadata with their own token. When the person is changing to a
 * different Discord account, the old account's roles are cleared first, so
 * one person cannot leave a role on each account they link in turn.
 */
export async function completeLink(opts: {
  db: DrizzleDB;
  config: DiscordConfig;
  /** AUTH_SECRET: the tokens are sealed under a key derived from it. */
  secret: string;
  state: DiscordState;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<LinkResult> {
  const { db, config, secret, state, code } = opts;
  const doFetch = opts.fetchImpl ?? fetch;

  const target = await resolveConnectTarget(db, state.u, state.h);
  if (!target) return { ok: false, reason: "not_accepted" };
  const { hackathon, participant, roles } = target;
  const home: LinkHome = roles.hacker
    ? "hackathon"
    : roles.judge
      ? "judge"
      : "scan";
  const fail = (
    reason: LinkErrorReason,
    extra: { retryAfter?: number } = {},
  ): LinkResult => ({ ok: false, reason, hackathon, home, ...extra });

  const tokenRes = await doFetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    const { status, retryAfter } = await refusal("token", tokenRes);
    if (status === 400) return fail("bad_code");
    return fail(failureFor(status), { retryAfter });
  }
  const tokens = readTokens(await tokenRes.json());
  if (!tokens) return fail("bad_code");
  const accessToken = tokens.accessToken;

  const meRes = await doFetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) {
    const { status, retryAfter } = await refusal("me", meRes);
    return fail(failureFor(status), { retryAfter });
  }
  const me = (await meRes.json()) as {
    id?: string;
    username?: string;
    global_name?: string | null;
  };
  if (!me.id || !me.username) return fail("discord_error");
  const displayName = me.global_name || me.username;

  if (await heldByAnother(db, me.id, state.u, hackathon.id)) {
    return fail("already_linked");
  }

  const [priorLink] = await db
    .select()
    .from(discordLinks)
    .where(eq(discordLinks.userId, state.u))
    .limit(1);
  // A different account than the one linked before: its roles are cleared
  // first, with the token kept for it. If Discord cannot be reached to do that,
  // the link does not move. A link with no token, or one Discord says was
  // withdrawn, has nothing to clear.
  let clearedOldAccount = false;
  if (priorLink && priorLink.discordUserId !== me.id) {
    const cleared = await zeroDiscordRoles(db, priorLink, {
      config,
      secret,
      fetchImpl: doFetch,
    });
    if (cleared === "failed") return fail("discord_error");
    clearedOldAccount = cleared === "cleared" || cleared === "revoked";
  }

  // Only a confirmed hacker has a flower and a Ramadan choice.
  const hacker = await hackerPayload(
    db,
    target,
    state.r === null ? null : state.r === 1,
  );
  const metadata = roleMetadata(roles, hacker);
  const signature = roleSignature(metadata);

  const before = participant && {
    discordUserId: participant.discordUserId,
    discordUsername: participant.discordUsername,
    discordLinkedAt: participant.discordLinkedAt,
    ramadanRoleOptIn: participant.ramadanRoleOptIn,
  };
  const linkedAt = new Date();
  const link = {
    discordUserId: me.id,
    discordUsername: me.username,
    linkedAt,
    ...sealTokens(tokens, secret, state.u),
    // Set once Discord has taken the roles.
    rolesSig: null,
  };
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(discordLinks)
        .values({ userId: state.u, ...link })
        .onConflictDoUpdate({ target: discordLinks.userId, set: link });
      // A confirmed hacker's link is mirrored on their participant row, which
      // carries the Ramadan choice and the roster columns.
      if (hacker && participant) {
        await tx
          .update(hackathonParticipants)
          .set({
            discordUserId: me.id,
            discordUsername: me.username,
            discordLinkedAt: linkedAt,
            ramadanRoleOptIn: hacker.ramadan === 1,
            updatedAt: linkedAt,
          })
          .where(
            and(
              eq(hackathonParticipants.id, participant.id),
              eq(hackathonParticipants.hackathonId, hackathon.id),
            ),
          );
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("already_linked");
    throw error;
  }

  const putRes = await putRoleConnection(
    doFetch,
    config,
    accessToken,
    displayName,
    metadata,
  );
  if (!putRes.ok) {
    // Roll the link back: a stored link whose roles never reached Discord
    // would read as done. When the old account was just cleared there is
    // nothing to go back to, so nothing is linked.
    await db.transaction(async (tx) => {
      if (priorLink && !clearedOldAccount) {
        await tx
          .update(discordLinks)
          .set({
            discordUserId: priorLink.discordUserId,
            discordUsername: priorLink.discordUsername,
            linkedAt: priorLink.linkedAt,
            accessTokenEnc: priorLink.accessTokenEnc,
            refreshTokenEnc: priorLink.refreshTokenEnc,
            tokenExpiresAt: priorLink.tokenExpiresAt,
            rolesSig: priorLink.rolesSig,
          })
          .where(eq(discordLinks.userId, state.u));
      } else {
        await tx.delete(discordLinks).where(eq(discordLinks.userId, state.u));
      }
      if (hacker && participant && before) {
        await tx
          .update(hackathonParticipants)
          .set(
            clearedOldAccount
              ? {
                  discordUserId: null,
                  discordUsername: null,
                  discordLinkedAt: null,
                  ramadanRoleOptIn: null,
                }
              : before,
          )
          .where(eq(hackathonParticipants.id, participant.id));
      }
    });
    const { status, retryAfter } = await refusal("role-connection", putRes);
    return fail(failureFor(status), { retryAfter });
  }

  await db
    .update(discordLinks)
    .set({ rolesSig: signature })
    .where(eq(discordLinks.userId, state.u));

  return {
    ok: true,
    then: state.t,
    hackathon,
    home,
    username: me.username,
  };
}
