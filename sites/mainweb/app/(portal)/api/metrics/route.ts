import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@query/db";
import {
  refreshDbGauges,
  renderMetrics,
  metricsContentType,
} from "@query/api/metrics";

/**
 * Prometheus scrape target.
 *
 * Node runtime and never cached: the whole point is a fresh read, and the
 * default static optimisation would serve one snapshot forever.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who may scrape.
 *
 * This exposes member counts, payment counts and process internals — not
 * personal data, but not a public page either. In production a token is
 * mandatory and a request without it gets a 404 rather than a 401, so the
 * endpoint does not announce itself to anyone probing for it.
 *
 * In development the token is optional, because a local Prometheus pointed at
 * `next dev` is the common case and a required secret would only be pasted into
 * a file and forgotten.
 */
function authorized(req: NextRequest) {
  const token = process.env.METRICS_TOKEN;

  if (!token) return process.env.NODE_ENV !== "production";

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  // Length-independent comparison is overkill for a scrape token, but constant
  // work costs nothing here and the alternative invites a timing argument.
  if (provided.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Read-only counts behind a 60s cache. Nothing here writes, because the
  // database this reads is a 0.5 GB Neon instance.
  await refreshDbGauges(db);

  return new NextResponse(await renderMetrics(), {
    status: 200,
    headers: {
      "content-type": metricsContentType,
      "cache-control": "no-store",
    },
  });
}
