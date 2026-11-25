import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { auth } from "@query/auth";
import { siteOrigin } from "@query/core/server";
import {
  BURST_LIMITS,
  rateLimitShared,
  resolveClientIp,
} from "@query/api/middleware/security";
import { completeLink, discordConfig, verifyState } from "@query/api/discord";
import {
  STATE_COOKIE,
  authSecret,
  backToPortal,
  redirectUri,
} from "@/lib/discord-route";

/**
 * Discord sends the user back here with ?code=&state=. Checks the signed
 * state, the cookie that started the flow and the signed-in user, then links.
 * On success it goes to the server invite (first join) or the portal; on any
 * failure back to the hackathon page with ?discord=error&reason=.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = discordConfig();
  const secret = authSecret();
  if (!config || !secret || !db) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.redirect(new URL("/login", siteOrigin()));

  const ip = resolveClientIp(request.headers.get("x-forwarded-for"));
  const limit = await rateLimitShared(
    `discord-callback:${userId}:${ip}`,
    BURST_LIMITS.tenPerHour.maxTokens,
    BURST_LIMITS.tenPerHour.refillRate,
  );
  if (!limit.allowed) {
    return backToPortal(null, { discord: "error", reason: "rate_limited" });
  }

  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const cookie = request.cookies.get(STATE_COOKIE)?.value;
  const state =
    stateParam && cookie === stateParam
      ? verifyState(stateParam, secret, { userId })
      : null;
  if (!state) {
    return backToPortal(null, { discord: "error", reason: "bad_state" });
  }
  const code = params.get("code");
  if (params.get("error") || !code) {
    return backToPortal(null, { discord: "error", reason: "cancelled" });
  }

  let result;
  try {
    result = await completeLink({
      db: db as DrizzleDB,
      config,
      state,
      code,
      redirectUri: redirectUri(),
    });
  } catch {
    return backToPortal(null, { discord: "error", reason: "discord_error" });
  }

  if (!result.ok) {
    const extra: Record<string, string> = {};
    if (result.retryAfter) extra.retry = String(result.retryAfter);
    return backToPortal(result.hackathon ?? null, {
      discord: "error",
      reason: result.reason,
      ...extra,
    });
  }
  if (result.then === "invite") {
    const res = NextResponse.redirect(config.inviteUrl);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/discord" });
    return res;
  }
  return backToPortal(result.hackathon, { discord: "linked" });
}
