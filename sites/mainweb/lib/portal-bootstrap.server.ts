import { cookies, headers } from "next/headers";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { appRouter, createContext, resolveClientIp } from "@query/api";

/**
 * What every signed-in portal page needs before it can draw: who is signed in
 * and the two reads the sidebar makes. Fetched here, once, and handed to the
 * client providers, so the browser neither asks /api/auth/session for the
 * session nor makes a tRPC round trip for the portal context after hydration.
 *
 * Visitors with no session cookie (the login page, guest judges, the public
 * hacklytics page) skip all of it and mount exactly as they did before.
 */
export async function loadPortalBootstrap() {
  const jar = await cookies();
  const hasSessionCookie = jar
    .getAll()
    .some((c) => c.name.endsWith("authjs.session-token"));
  if (!hasSessionCookie) return { session: undefined, state: undefined };

  const ctx = await createContext({
    clientIp: resolveClientIp((await headers()).get("x-forwarded-for")),
  });
  if (!ctx.session?.user) return { session: undefined, state: undefined };

  const caller = appRouter.createCaller(ctx);
  const queryClient = new QueryClient();

  // Keys match what trpc.<path>.useQuery builds on the client.
  const portal = await caller.user.getPortalContext().catch(() => null);
  if (portal) {
    queryClient.setQueryData([["user", "getPortalContext"], { type: "query" }], portal);
  }
  if (portal && !portal.isAdmin && !portal.isBugTester) {
    const regs = await caller.hackathon.myRegistrations().catch(() => null);
    if (regs) {
      queryClient.setQueryData(
        [["hackathon", "myRegistrations"], { type: "query" }],
        regs,
      );
    }
  }

  // Only what the browser's own session carries, never the session token.
  const { user, expires } = ctx.session;
  const session: Session = {
    expires: expires ?? "",
    user: {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      image: user?.image,
    } as Session["user"],
  };
  return { session, state: dehydrate(queryClient) };
}
