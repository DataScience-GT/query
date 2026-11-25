import { NextResponse } from "next/server";
import { siteOrigin } from "@query/core/server";
import { hackathonPathSegment } from "@/lib/hackathon-slug";

export function authSecret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

export const redirectUri = () => `${siteOrigin()}/api/discord/callback`;

/** Back to the hackathon page (or the dashboard) with a Discord outcome. */
export function backToPortal(
  hackathon: { id: string; name: string } | null,
  params: Record<string, string>,
) {
  const path = hackathon
    ? `/hackathons/${hackathonPathSegment(hackathon.name, hackathon.id)}`
    : "/dashboard";
  const url = new URL(path, siteOrigin());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}
