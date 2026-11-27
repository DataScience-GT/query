import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { auth } from "@query/auth";
import { siteOrigin } from "@query/core/server";
import {
  discordConfig,
  resolveConnectTarget,
  signState,
} from "@query/api/discord";
import { safeCallback } from "@/lib/safe-callback";
import {
  authSecret,
  backToPortal,
  overLimit,
  redirectUri,
} from "@/lib/discord-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Starts the Discord link. Also the "Linked Roles Verification URL" in the
 * Discord developer portal, which sends no query: the edition then defaults to
 * the newest live one in which the signed-in user holds a role (a hacker who
 * confirmed they are coming, an approved judge, or a volunteer).
 *
 *   ?hackathon=ID     optional
 *   ?ramadan=1|0      optional; absent keeps the stored choice
 *   ?then=invite      after linking, go to the server invite (default: portal)
 *
 * A GET on purpose: it is a top-level navigation to discord.com, which the
 * CSP's form-action rule does not touch. It changes nothing here; the signed
 * state is what protects the callback.
 */
export async function GET(request: NextRequest) {
  const config = discordConfig();
  const secret = authSecret();
  if (!config || !secret || !db) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    const here = safeCallback(request.nextUrl.pathname + request.nextUrl.search);
    const login = new URL("/login", siteOrigin());
    if (here) login.searchParams.set("callbackUrl", here);
    return NextResponse.redirect(login);
  }

  if (await overLimit(request, "connect", userId)) {
    return backToPortal(null, { discord: "error", reason: "rate_limited" });
  }

  const params = request.nextUrl.searchParams;
  const rawHackathon = params.get("hackathon");
  const hackathonId =
    rawHackathon && UUID.test(rawHackathon) ? rawHackathon : null;
  const target = await resolveConnectTarget(
    db as DrizzleDB,
    userId,
    hackathonId,
  );
  if (!target) {
    return backToPortal(null, { discord: "error", reason: "not_accepted" });
  }

  const ramadan = params.get("ramadan");
  const state = signState(
    {
      u: userId,
      h: target.hackathon.id,
      r: ramadan === "1" ? 1 : ramadan === "0" ? 0 : null,
      t: params.get("then") === "invite" ? "invite" : "portal",
    },
    secret,
  );

  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("scope", "identify role_connections.write");
  authorize.searchParams.set("prompt", "consent");
  authorize.searchParams.set("redirect_uri", redirectUri());
  authorize.searchParams.set("state", state);

  return NextResponse.redirect(authorize);
}
