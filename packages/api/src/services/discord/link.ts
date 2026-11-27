import { and, eq, ne } from "drizzle-orm";
import { discordLinks, hackathonParticipants } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { foodGroupByKey } from "./config";
import type { DiscordConfig } from "./config";
import { ensureFoodGroup } from "./food-group";
import { discordContext, hasDiscordRole, roleMetadata } from "./roles";
import type { DiscordParticipant } from "./roles";
import type { DiscordState } from "./state";
import { isUniqueViolation } from "../../middleware/db-errors";

const API = "https://discord.com/api/v10";

type LinkErrorReason =
  | "not_accepted"
  | "bad_code"
  | "rate_limited"
  | "discord_denied"
  | "discord_error"
  | "already_linked";

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

/** The Ramadan flag Discord receives: opted in AND fasting is "Yes". */
export const ramadanFlag = (optIn: boolean, fasting: string | null | undefined) =>
  optIn && fasting === "Yes" ? 1 : 0;

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

function failureFor(status: number): LinkErrorReason {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "discord_denied";
  return "discord_error";
}

/**
 * A refused Discord call: logs the step, status and Discord's error body (never
 * a token; the bodies of failed calls carry only an error code and message),
 * and reads `retry_after` from the same body for a 429.
 */
async function refusal(
  step: "token" | "me" | "role-connection",
  res: Response,
): Promise<{ status: number; retryAfter?: number }> {
  const text = await res.text().catch(() => "");
  // Deliberate operational logging: the only trace of why a link failed.
  // oxlint-disable-next-line no-console
  console.warn(`[Discord link] ${step} refused: ${res.status} ${text.slice(0, 300)}`);
  let retryAfter: number | undefined;
  if (res.status === 429) {
    try {
      const n = (JSON.parse(text) as { retry_after?: number }).retry_after;
      if (typeof n === "number") retryAfter = Math.ceil(n);
    } catch {
      // No JSON body: retry with no hint.
    }
  }
  return { status: res.status, retryAfter };
}

/**
 * The callback, after the route has checked the state and session. Exchanges
 * the code, reads the account, stores the link, then publishes the Linked
 * Roles metadata with the user's own token. The token is never kept.
 */
export async function completeLink(opts: {
  db: DrizzleDB;
  config: DiscordConfig;
  state: DiscordState;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<LinkResult> {
  const { db, config, state, code } = opts;
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
  const accessToken = ((await tokenRes.json()) as { access_token?: string })
    .access_token;
  if (!accessToken) return fail("bad_code");

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

  // Only a confirmed hacker has a flower and a Ramadan choice. The flower is
  // assigned first, so the metadata always has one.
  let hacker: { foodGroup: number; ramadan: 0 | 1 } | null = null;
  if (roles.hacker && participant) {
    const groupKey = await ensureFoodGroup(db, hackathon.id, participant.id);
    const optIn =
      state.r === null
        ? (participant.ramadanRoleOptIn ?? false)
        : state.r === 1;
    hacker = {
      foodGroup: foodGroupByKey(groupKey)?.number ?? 0,
      ramadan: ramadanFlag(optIn, participant.ramadanFasting),
    };
  }

  const [priorLink] = await db
    .select()
    .from(discordLinks)
    .where(eq(discordLinks.userId, state.u))
    .limit(1);
  const before = participant && {
    discordUserId: participant.discordUserId,
    discordUsername: participant.discordUsername,
    discordLinkedAt: participant.discordLinkedAt,
    ramadanRoleOptIn: participant.ramadanRoleOptIn,
  };
  const linkedAt = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(discordLinks)
        .values({
          userId: state.u,
          discordUserId: me.id!,
          discordUsername: me.username!,
          linkedAt,
        })
        .onConflictDoUpdate({
          target: discordLinks.userId,
          set: {
            discordUserId: me.id!,
            discordUsername: me.username!,
            linkedAt,
          },
        });
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

  const putRes = await doFetch(
    `${API}/users/@me/applications/${config.clientId}/role-connection`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform_name: "Hacklytics",
        platform_username: displayName,
        metadata: roleMetadata(roles, hacker),
      }),
    },
  );
  if (!putRes.ok) {
    // Roll the link back: a stored link whose roles never reached Discord
    // would read as done.
    await db.transaction(async (tx) => {
      if (priorLink) {
        await tx
          .update(discordLinks)
          .set({
            discordUserId: priorLink.discordUserId,
            discordUsername: priorLink.discordUsername,
            linkedAt: priorLink.linkedAt,
          })
          .where(eq(discordLinks.userId, state.u));
      } else {
        await tx.delete(discordLinks).where(eq(discordLinks.userId, state.u));
      }
      if (hacker && participant && before) {
        await tx
          .update(hackathonParticipants)
          .set(before)
          .where(eq(hackathonParticipants.id, participant.id));
      }
    });
    const { status, retryAfter } = await refusal("role-connection", putRes);
    return fail(failureFor(status), { retryAfter });
  }

  return {
    ok: true,
    then: state.t,
    hackathon,
    home,
    username: me.username,
  };
}
