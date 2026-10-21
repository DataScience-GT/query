import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { auth } from "@query/auth";
import { db } from "@query/db";
import {
  JUDGING_GUEST_COOKIE,
  activateRoomLink,
  guestCookieOptions,
} from "@query/api/judging-access";

/**
 * Where a judging room's QR code lands. A signed-in judge is seated in the
 * room and goes to their desk; anyone else gets a guest session for that room
 * and goes to the guest desk to give a name. The redirects are relative so
 * they keep whatever host the proxy in front of us answered on.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEAD_LINK = "/judge/guest/invalid-link";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params;
  const sig = request.nextUrl.searchParams.get("sig");
  // The id goes into a uuid column; anything else is a mistyped link, not a 500.
  if (!sig || !UUID.test(linkId)) redirect(DEAD_LINK);

  if (!db) {
    return new Response(
      "Judging is unavailable right now. Scan the QR code again in a minute.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const session = await auth();
  const cookieStore = await cookies();
  const result = await activateRoomLink(db, {
    linkId,
    sig,
    userId: session?.user?.id ?? null,
    userName: session?.user?.name ?? null,
    guestToken: cookieStore.get(JUDGING_GUEST_COOKIE)?.value ?? null,
  });

  if (result.kind === "invalid") redirect(DEAD_LINK);
  if (result.kind === "member") redirect(`/judge/${result.hackathonId}`);

  // No token means this browser already holds a live session for this room.
  if (result.token) {
    cookieStore.set(JUDGING_GUEST_COOKIE, result.token, guestCookieOptions());
  }
  redirect(`/judge/guest/${result.hackathonId}`);
}
