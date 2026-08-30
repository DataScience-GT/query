import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy middleware for HTTP caching.
 *
 * Sets Cache-Control and Vary, and nothing else. It deliberately does NOT mint
 * validators: it used to derive an ETag from the pathname alone
 * (`hex(pathname)`), which never changed across deploys, and answer a matching
 * If-None-Match with `304 + Cache-Control: max-age=31536000, immutable`. A 304
 * updates the stored cache entry (RFC 7234 §4.3.4), so the first revalidation
 * of any page promoted a 60-second entry to a one-year immutable one and the
 * browser stopped contacting the server for that URL entirely. After a deploy
 * those users held a frozen document pointing at deleted `/_next/static`
 * chunks, with no server-side way to reach them. Next generates content-derived
 * validators on its own; letting it do that is the fix.
 *
 * The Last-Modified half was already inert — `getLastModified()` returned
 * `new Date()`, so `If-Modified-Since >= now` never held.
 */

/**
 * Everything behind authentication. Marking these `public` let shared caches
 * store one member's rendered dashboard; `Vary: Cookie` is not a safe enough
 * answer when the alternative costs nothing. `no-store` also stops the browser
 * writing them to disk, which matters on the shared machines at check-in.
 */
const PRIVATE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/club",
  "/hackathons",
  "/initiatives",
  "/judge",
  "/lead",
  "/settings",
  "/submit",
  "/verify",
  "/login",
  "/scan",
];

function getCacheControl(pathname: string): string {
  if (PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return "private, no-store, must-revalidate";
  }
  if (pathname === "/") {
    return "public, max-age=300, must-revalidate";
  }
  // Assets under public/. Hashed build output never reaches here — the matcher
  // below excludes _next/static.
  if (
    pathname.match(
      /\.(js|css|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$/,
    )
  ) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.startsWith("/events") || pathname.startsWith("/projects")) {
    return "public, max-age=3600, stale-while-revalidate=86400";
  }
  if (pathname.startsWith("/history")) {
    return "public, max-age=1800, stale-while-revalidate=7200";
  }
  return "no-cache, no-store, must-revalidate";
}

const securityHeaders: string[] = [
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "X-XSS-Protection: 1; mode=block",
];

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/trpc|api/auth|api/webhooks).*)",
  ],
  headers: true,
};

export async function proxy(req: NextRequest): Promise<Response> {
  const response = NextResponse.next();

  response.headers.set(
    "Cache-Control",
    getCacheControl(req.nextUrl.pathname),
  );
  response.headers.set("Vary", "Accept-Encoding, Cookie, Authorization");

  securityHeaders.forEach((header) => {
    const [key, value] = header.split(": ");
    response.headers.set(key, value);
  });

  return response;
}
