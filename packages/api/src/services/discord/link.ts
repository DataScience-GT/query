import { and, eq } from "drizzle-orm";
import { hackathonParticipants } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { foodGroupByKey, isDiscordEligible } from "./config";
import type { DiscordConfig } from "./config";
import { ensureFoodGroup } from "./food-group";
import type { DiscordState } from "./state";
import { isUniqueViolation } from "../../middleware/db-errors";

const API = "https://discord.com/api/v10";

export type LinkErrorReason =
  | "not_accepted"
  | "bad_code"
  | "rate_limited"
  | "discord_denied"
  | "discord_error"
  | "already_linked";

export type HackathonRef = { id: string; name: string };

export type LinkResult =
  | {
      ok: true;
      then: DiscordState["t"];
      hackathon: HackathonRef;
      username: string;
    }
  | {
      ok: false;
      reason: LinkErrorReason;
      hackathon?: HackathonRef;
      retryAfter?: number;
    };

/**
 * The participant a connect request is for. With a hackathon id, that one;
 * without (Discord's Linked Roles verification URL sends none), the newest
 * edition that is not cancelled or over which the user is accepted to.
 * Null when they are not accepted there.
 */
export async function resolveConnectTarget(
  db: DrizzleDB,
  userId: string,
  hackathonId: string | null,
) {
  if (hackathonId) {
    const row = await db.query.hackathonParticipants.findFirst({
      where: { hackathonId, userId },
      with: { hackathon: { columns: { id: true, name: true } } },
    });
    return row && isDiscordEligible(row.registrationStatus) ? row : null;
  }
  const rows = await db.query.hackathonParticipants.findMany({
    where: { userId },
    with: {
      hackathon: {
        columns: { id: true, name: true, status: true, startDate: true },
      },
    },
  });
  const live = rows
    .filter(
      (r) =>
        isDiscordEligible(r.registrationStatus) &&
        r.hackathon &&
        r.hackathon.status !== "cancelled" &&
        r.hackathon.status !== "completed",
    )
    .sort(
      (a, b) =>
        new Date(b.hackathon!.startDate).getTime() -
        new Date(a.hackathon!.startDate).getTime(),
    );
  return live[0] ?? null;
}

/** The Ramadan flag Discord receives: opted in AND fasting is "Yes". */
export const ramadanFlag = (optIn: boolean, fasting: string | null | undefined) =>
  optIn && fasting === "Yes" ? 1 : 0;

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

  const participant = await resolveConnectTarget(db, state.u, state.h);
  if (!participant) return { ok: false, reason: "not_accepted" };
  const hackathon: HackathonRef = {
    id: participant.hackathon!.id,
    name: participant.hackathon!.name,
  };
  const fail = (
    reason: LinkErrorReason,
    extra: { retryAfter?: number } = {},
  ): LinkResult => ({ ok: false, reason, hackathon, ...extra });

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

  // The food group first, so the metadata always has one.
  const groupKey = await ensureFoodGroup(db, hackathon.id, participant.id);
  const optIn =
    state.r === null
      ? (participant.ramadanRoleOptIn ?? false)
      : state.r === 1;
  const ramadan = ramadanFlag(optIn, participant.ramadanFasting);
  const before = {
    discordUserId: participant.discordUserId,
    discordUsername: participant.discordUsername,
    discordLinkedAt: participant.discordLinkedAt,
    ramadanRoleOptIn: participant.ramadanRoleOptIn,
  };
  try {
    await db
      .update(hackathonParticipants)
      .set({
        discordUserId: me.id,
        discordUsername: me.username,
        discordLinkedAt: new Date(),
        ramadanRoleOptIn: ramadan === 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hackathonParticipants.id, participant.id),
          eq(hackathonParticipants.hackathonId, hackathon.id),
        ),
      );
  } catch (error) {
    if (isUniqueViolation(error)) return fail("already_linked");
    throw error;
  }

  const group = foodGroupByKey(groupKey);
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
        metadata: {
          accepted: 1,
          food_group: group?.number ?? 0,
          ramadan,
        },
      }),
    },
  );
  if (!putRes.ok) {
    // Roll the link back: a stored link whose roles never reached Discord
    // would read as done.
    await db
      .update(hackathonParticipants)
      .set(before)
      .where(eq(hackathonParticipants.id, participant.id));
    const { status, retryAfter } = await refusal("role-connection", putRes);
    return fail(failureFor(status), { retryAfter });
  }

  return {
    ok: true,
    then: state.t,
    hackathon,
    username: me.username,
  };
}
