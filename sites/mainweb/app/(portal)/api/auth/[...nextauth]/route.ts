import { handlers } from "@query/auth";
import { rateLimit, resolveClientIp } from "@query/api";
import type { NextRequest } from "next/server";

export const { GET } = handlers;

// Each email sign-in sends a message, so one address could otherwise ask for
// mail to any number of inboxes. The per-address and deployment-wide caps live
// in the database (sendVerificationRequest); this per-IP bucket stops a single
// host before it spends them. It is per instance, so it is only a speed bump.
export async function POST(request: NextRequest) {
  if (new URL(request.url).pathname.endsWith("/signin/nodemailer")) {
    const ip = resolveClientIp(request.headers.get("x-forwarded-for"));
    if (!rateLimit(`signin-email:${ip}`, 20, 0.01).allowed) {
      return new Response("Too many attempts. Please try again later.", {
        status: 429,
      });
    }
  }
  return handlers.POST(request);
}

// Return 200 for HEAD requests (email client link preview/prefetch)
// to prevent UnknownAction errors from cluttering logs
export function HEAD() {
  return new Response(null, { status: 200 });
}
