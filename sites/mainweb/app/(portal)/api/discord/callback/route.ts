import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { auth } from "@query/auth";
import { siteOrigin } from "@query/core/server";
import { completeLink, discordConfig, verifyState } from "@query/api/discord";
import {
  authSecret,
  backToPortal,
  overLimit,
  redirectUri,
} from "@/lib/discord-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discord sends the user back here with ?code=&state=. Checks the signed
 * state and the signed-in user, then links. On success it goes to the server
 * invite (first join) or the portal; on any failure back to the hackathon page
 * with ?discord=error&reason=.
 */
export async function GET(request: NextRequest) {
  const config = discordConfig();
  const secret = authSecret();
  if (!config || !secret || !db) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.redirect(new URL("/login", siteOrigin()));

  if (await overLimit(request, "callback", userId)) {
    return backToPortal(null, { discord: "error", reason: "rate_limited" });
  }

  const params = request.nextUrl.searchParams;
  // The state is signed with the server secret and names the signed-in user,
  // so one minted for anybody else, or tampered with, or expired, fails here.
  const state = verifyState(params.get("state"), secret, { userId });
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
    return NextResponse.redirect(config.inviteUrl);
  }
  return backToPortal(result.hackathon, { discord: "linked" });
}
