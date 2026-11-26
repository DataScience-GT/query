import { handlers, runCodeRequest } from "@query/auth";
import { rateLimit, resolveClientIp } from "@query/api";
import { siteOrigin } from "@query/core/server";
import { CODES_BUSY, CODES_PAUSED } from "@/lib/email-sign-in";
import type { NextRequest } from "next/server";

export const { GET } = handlers;

// What the sign-in page reads when no code could be sent right now. next-auth's
// client takes the `error` off the url it is handed, and a bare 429 would read
// as a failure to parse the answer.
const codesBusy = () =>
  Response.json(
    { url: `${siteOrigin()}/login?error=${CODES_BUSY}` },
    { status: 429 },
  );

// What the page reads when the email held a sign-in link, not a code, because
// the address is locked out of codes. Auth.js's own answer would send the page
// to wait for a code that is not coming. Whatever Auth.js set on the response
// stays.
const linkSent = (from: Response) => {
  const headers = new Headers(from.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  return Response.json(
    { url: `${siteOrigin()}/login?notice=${CODES_PAUSED}` },
    { status: from.status, headers },
  );
};

// Each email sign-in sends a message, so one address could otherwise ask for
// mail to any number of inboxes. The caps that hold live in the database
// (sendVerificationRequest): per address, per network, per email domain and for
// the whole deployment. This per-IP bucket stops a single host before it
// reaches them. It is per instance, so it is only a speed bump.
export async function POST(request: NextRequest) {
  if (!new URL(request.url).pathname.endsWith("/signin/nodemailer")) {
    return handlers.POST(request);
  }

  const ip = resolveClientIp(request.headers.get("x-forwarded-for"));
  if (!rateLimit(`signin-email:${ip}`, 20, 0.01).allowed) return codesBusy();

  // Auth.js answers "sent" whatever the hook did, so ask the hook.
  const { response, busy, linkOnly } = await runCodeRequest(ip, () =>
    handlers.POST(request),
  );
  if (busy) return codesBusy();
  return linkOnly ? linkSent(response) : response;
}

// Return 200 for HEAD requests (email client link preview/prefetch)
// to prevent UnknownAction errors from cluttering logs
export function HEAD() {
  return new Response(null, { status: 200 });
}
