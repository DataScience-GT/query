import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { siteOrigin } from "@query/core/server";
import {
  BURST_LIMITS,
  rateLimitShared,
  resolveClientIp,
} from "@query/api/middleware/security";
import type { LinkHome } from "@query/api/discord";
import { hackathonPathSegment } from "@/lib/hackathon-slug";

export function authSecret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

export const redirectUri = () => `${siteOrigin()}/api/discord/callback`;

/** True once this user, from this address, has used up the hour's attempts. */
export async function overLimit(
  request: NextRequest,
  route: "connect" | "callback",
  userId: string,
) {
  const ip = resolveClientIp(request.headers.get("x-forwarded-for"));
  const { allowed } = await rateLimitShared(
    `discord-${route}:${userId}:${ip}`,
    BURST_LIMITS.tenPerHour.maxTokens,
    BURST_LIMITS.tenPerHour.refillRate,
  );
  return !allowed;
}

/**
 * Back to the page the person's Discord card lives on, with a Discord outcome:
 * the hackathon page for a hacker, the judge page for a judge, the check-in
 * desk for a volunteer. The dashboard when no edition is known.
 */
export function backToPortal(
  hackathon: { id: string; name: string } | null,
  params: Record<string, string>,
  home: LinkHome = "hackathon",
) {
  const path = !hackathon
    ? "/dashboard"
    : home === "judge"
      ? "/judge"
      : home === "scan"
        ? "/scan"
        : `/hackathons/${hackathonPathSegment(hackathon.name, hackathon.id)}`;
  const url = new URL(path, siteOrigin());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}
