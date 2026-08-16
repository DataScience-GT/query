import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Where Content-Security-Policy violations land while the policy is
 * report-only.
 *
 * The point of report-only is to find out what the policy *would* have blocked
 * before it blocks it — and a policy nobody can see the reports from tells you
 * nothing. Browsers POST here on every violation; the container collects
 * stderr, so `[CSP]` lines in the logs are the record of what to fix (or
 * allow) before CSP_ENFORCE is turned on.
 *
 * Deliberately unauthenticated: the browser sends these without credentials,
 * and the body is a report about our own pages. It is rate-limited by being
 * useless to an attacker — the worst case is noise in a log, so the size cap
 * below is the only guard that matters.
 */

/** Reports are small. Anything larger is not a browser. */
const MAX_REPORT_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
  try {
    /**
     * Checked BEFORE the body is read, not after.
     *
     * `await request.text()` buffers the whole request first, so a
     * length check on the result has already accepted whatever was sent — the
     * cap was documentation rather than a limit. An absent or unparseable
     * Content-Length is refused too: this endpoint is unauthenticated, and a
     * browser sending a violation report always declares one.
     */
    const declared = Number(request.headers.get("content-length"));

    if (!Number.isFinite(declared) || declared > MAX_REPORT_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    const body = await request.text();

    // Content-Length is the sender's claim; the body is the truth.
    if (body.length > MAX_REPORT_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    // Two formats in the wild: the legacy `report-uri` shape
    // ({"csp-report": {...}}) and the newer Reporting API array. Log a
    // newline-stripped copy — the body is attacker-controlled (this endpoint
    // is unauthenticated) and a raw CR/LF would forge extra log lines.
    const forLog = body
      .slice(0, MAX_REPORT_BYTES)
      .replace(/[\n\r]/g, " ");
    console.warn("[CSP] violation report:", forLog);
  } catch (error) {
    console.error("[CSP] failed to read a violation report:", error);
  }

  // 204 regardless: a failed report must never look like a page error to the
  // browser that sent it.
  return new NextResponse(null, { status: 204 });
}
