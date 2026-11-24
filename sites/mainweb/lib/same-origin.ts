import { siteOrigin } from "@query/core/server";

/**
 * True when the request came from this site's own pages. SameSite=Lax cookies
 * still ride along on a form POST from a sibling host (same site, other
 * origin), so a cookie-authenticated write must also check where it came from:
 * the Origin header, or Sec-Fetch-Site: same-origin where Origin is absent.
 */
export function isSameOriginRequest(headers: Headers) {
  const origin = headers.get("origin");
  if (origin) return origin === siteOrigin();
  return headers.get("sec-fetch-site") === "same-origin";
}
