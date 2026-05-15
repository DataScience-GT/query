import { type NextRequest, NextResponse } from "next/server";

/**
 * Proxy middleware for HTTP caching and edge caching
 *
 * This file handles:
 * - Cache-Control headers for static and dynamic content
 * - ETag/Last-Modified for validation caching
 * - Vary headers for cache correctness
 */

// Define cache control based on route pattern
function getCacheControl(pathname: string): string {
  if (pathname === "/") {
    return "public, max-age=300, must-revalidate";
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
    return "public, max-age=60, must-revalidate";
  }
  if (pathname.match(/\.(js|css|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$/)) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.startsWith("/hackathons") || pathname.startsWith("/events") || pathname.startsWith("/projects")) {
    return "public, max-age=3600, stale-while-revalidate=86400";
  }
  if (pathname.startsWith("/club") || pathname.startsWith("/history")) {
    return "public, max-age=1800, stale-while-revalidate=7200";
  }
  return "no-cache, no-store, must-revalidate";
}

// Define ETag - simplified version
function getETag(pathname: string): string {
  const cacheKey = `${pathname}`;
  return `"${Buffer.from(cacheKey).toString("hex")}"`;
}

// Define Last-Modified
function getLastModified(): string {
  return new Date().toUTCString();
}

// Handle ETag validation
function handleETag(request: NextRequest): boolean {
  const ifNoneMatch = request.headers.get("If-None-Match");
  const etag = getETag(request.nextUrl.pathname);

  if (ifNoneMatch && ifNoneMatch === etag) {
    return true;
  }
  return false;
}

// Handle Last-Modified validation
function handleLastModified(request: NextRequest): boolean {
  const ifModifiedSince = request.headers.get("If-Modified-Since");
  const lastModified = getLastModified();

  if (ifModifiedSince && new Date(ifModifiedSince) >= new Date(lastModified)) {
    return true;
  }
  return false;
}

// Security headers
const securityHeaders: string[] = [
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "X-XSS-Protection: 1; mode=block",
];

// Static config for Next.js proxy
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/trpc|api/auth|api/webhooks).*)",
  ],
  headers: true,
};

// Export proxy function
export async function proxy(req: NextRequest): Promise<Response> {
  // Handle ETag validation - return 304 if unchanged
  if (handleETag(req)) {
    return new Response(null, {
      status: 304,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": getETag(req.nextUrl.pathname),
        "Last-Modified": getLastModified(),
        "Vary": "Accept-Encoding, Cookie, Authorization",
        ...securityHeaders.reduce((acc, header) => {
          const [key, value] = header.split(": ");
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>),
      },
    });
  }

  // Handle Last-Modified validation
  if (handleLastModified(req)) {
    return new Response(null, {
      status: 304,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Last-Modified": getLastModified(),
        "ETag": getETag(req.nextUrl.pathname),
        "Vary": "Accept-Encoding, Cookie, Authorization",
        ...securityHeaders.reduce((acc, header) => {
          const [key, value] = header.split(": ");
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>),
      },
    });
  }

  // Add cache headers to response via NextResponse.next()
  const cacheControl = getCacheControl(req.nextUrl.pathname);
  const etag = getETag(req.nextUrl.pathname);
  const lastModified = getLastModified();

  const response = NextResponse.next();

  // Set cache headers
  response.headers.set("Cache-Control", cacheControl);
  response.headers.set("ETag", etag);
  response.headers.set("Last-Modified", lastModified);
  response.headers.set("Vary", "Accept-Encoding, Cookie, Authorization");

  // Add security headers
  securityHeaders.forEach((header) => {
    const [key, value] = header.split(": ");
    response.headers.set(key, value);
  });

  return response;
}
