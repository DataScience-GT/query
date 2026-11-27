import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { sendApplicationReminders } from "@query/api/application-reminders";
import { syncExpiredDiscordRoles } from "@query/api/discord";
import {
  rateLimitShared,
  resolveClientIp,
} from "@query/api/middleware/security";
import { db } from "@query/db";

/**
 * The daily nudge to finish an application, and the daily sweep that takes the
 * Discord volunteer role back from volunteers whose term has run out, which
 * has no event of its own. App Hosting has no scheduler, so Cloud Scheduler
 * (set up separately, docs/features/hackathons.md) posts here with the shared
 * secret.
 *
 * Node runtime and never cached: every call has to do the work.
 *
 * Without CRON_SECRET the route answers 404, as if it did not exist, so a
 * deploy that forgot the secret is not an open endpoint. A wrong or missing
 * token is a 401. A repeated run is harmless, since sendApplicationReminders
 * mails each draft at most once, but the limit below still keeps a guessing
 * attack from running unchecked.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hashed first, so the comparison is constant work whatever length was sent. */
const digest = (value: string) => createHash("sha256").update(value).digest();

function authorized(req: NextRequest, secret: string) {
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(digest(provided), digest(secret));
}

const noStore = { "cache-control": "no-store" };

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Not found", { status: 404 });

  // Before the token is looked at, so wrong guesses count. One scheduled run a
  // day, plus a few by hand, is far inside this.
  const ip = resolveClientIp(req.headers.get("x-forwarded-for"));
  const limit = await rateLimitShared(
    `cron-application-reminders:${ip}`,
    10,
    10 / 3600,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: noStore },
    );
  }

  if (!authorized(req, secret)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { ...noStore, "www-authenticate": "Bearer" },
      },
    );
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503, headers: noStore },
    );
  }

  // Both jobs run whatever the other does. The sweep never throws, takes at
  // most 15 people and gives up after 20 seconds, so it cannot hold up the
  // reminders or push a run past Scheduler's deadline; what it does not reach
  // is picked up the next day.
  //
  // A Scheduler retry, or a run that overlaps the last, cannot mail a reminder
  // twice: sendApplicationReminders stamps each draft as taken in one UPDATE
  // before anything is sent (so a crash loses a reminder, never doubles one),
  // and a draft already stamped is not claimed again. The sweep is safe to
  // overlap too: each person's Discord work takes a per-person lock.
  let run;
  try {
    run = await sendApplicationReminders(db);
  } catch (error) {
    // Logged here, not returned: the caller only needs to know it failed.
    console.error("[application-reminders] run failed:", error);
  }
  const discord = await syncExpiredDiscordRoles(db);
  if (!run) {
    return NextResponse.json(
      { error: "Run failed" },
      { status: 500, headers: noStore },
    );
  }
  return NextResponse.json({ ...run, discord }, { headers: noStore });
}
