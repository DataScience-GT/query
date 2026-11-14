import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@query/db";
import {
  BURST_LIMITS,
  rateLimit,
  resolveClientIp,
} from "@query/api/middleware/security";
import {
  isAllowedJudgeInterestOrigin,
  judgeInterestInput,
  upsertJudgeInterest,
} from "@query/api/judge-interest";

/**
 * The "I might judge" form on the Hacklytics site. Public on purpose: the
 * visitor has no account, so the protection is the origin allow-list, a
 * honeypot, a body cap and a per-IP limit. Nothing about the submission is
 * logged: it is an email address and a name.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The form is a few short fields; anything bigger is not it. */
const MAX_BODY_BYTES = 8 * 1024;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (isAllowedJudgeInterestOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function reply(
  origin: string | null,
  status: number,
  body: Record<string, unknown>,
  extra: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { ...corsHeaders(origin), ...extra },
  });
}

export function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!isAllowedJudgeInterestOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  // Browsers always send Origin on a cross-origin POST, so a missing or foreign
  // one is a script or another site, not the form.
  if (!isAllowedJudgeInterestOrigin(origin)) {
    return reply(origin, 403, { error: "This site cannot send this form." });
  }

  const ip = resolveClientIp(req.headers.get("x-forwarded-for"));
  const limit = rateLimit(
    `judge-interest:${ip}`,
    BURST_LIMITS.tenPerHour.maxTokens,
    BURST_LIMITS.tenPerHour.refillRate,
  );
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil(limit.retryAfter ?? 60));
    return reply(
      origin,
      429,
      { error: "Too many submissions. Please try again later." },
      { "Retry-After": String(retryAfter) },
    );
  }

  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return reply(origin, 413, { error: "That submission is too large." });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return reply(origin, 400, { error: "Send the form as JSON." });
  }

  const parsed = judgeInterestInput.safeParse(json);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= issue.message;
    }
    return reply(origin, 400, {
      error: Object.values(fields)[0] ?? "Check the form and try again.",
      fields,
    });
  }

  const { website, ...input } = parsed.data;
  // A bot filled the field people cannot see. Say it worked so it learns
  // nothing, and store nothing.
  if (website) return reply(origin, 200, { ok: true });

  try {
    // `db` is null when DATABASE_URL is not configured.
    if (!db) throw new Error("no database");
    await upsertJudgeInterest(db, input);
  } catch {
    return reply(origin, 500, {
      error: "Something went wrong. Please try again or email hello@hacklytics.io.",
    });
  }
  return reply(origin, 200, { ok: true });
}
