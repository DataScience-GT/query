import { cache } from "react";
import { cookies, headers } from "next/headers";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { appRouter, createContext, resolveClientIp } from "@query/api";

/**
 * The signed-in visitor's tRPC caller for this request, or null when there is
 * none. Cached per request so the layout and a page's prefetch share one
 * session lookup.
 *
 * A visitor with no session cookie (the login page, guest judges, the public
 * hacklytics page) costs nothing here and mounts exactly as before.
 */
export const getPortalCaller = cache(async () => {
  const jar = await cookies();
  if (!jar.getAll().some((c) => c.name.endsWith("authjs.session-token"))) {
    return null;
  }
  const ctx = await createContext({
    clientIp: resolveClientIp((await headers()).get("x-forwarded-for")),
  });
  if (!ctx.session?.user) return null;
  return { session: ctx.session, caller: appRouter.createCaller(ctx) };
});

export type PortalCaller = NonNullable<
  Awaited<ReturnType<typeof getPortalCaller>>
>["caller"];

/** A prefetched read: `trpc.<path>.useQuery(input)` on the client hits this key. */
export type Prefetch = readonly [
  path: string,
  input: unknown,
  result: Promise<unknown>,
];

/**
 * Settles the reads and dehydrates the ones that succeeded. A failed read is
 * left out, so the browser fetches it and reports the error as it always did.
 */
export async function dehydratePrefetched(entries: readonly Prefetch[]) {
  const client = new QueryClient();
  await Promise.all(
    entries.map(async ([path, input, result]) => {
      const data = await result.catch(() => undefined);
      if (data === undefined) return;
      const key =
        input === undefined
          ? [path.split("."), { type: "query" }]
          : [path.split("."), { input, type: "query" }];
      client.setQueryData(key, data);
    }),
  );
  return dehydrate(client);
}

/**
 * What every signed-in portal page needs before it can draw: who is signed in
 * and the two reads the sidebar makes. Handed to the client providers, so the
 * browser neither asks /api/auth/session for the session nor makes a tRPC
 * round trip for the portal context after hydration.
 */
export async function loadPortalBootstrap() {
  // A failed lookup (the database unreachable, say) must not take the whole
  // portal down with it: fall back to the browser asking, as it did before.
  const signedIn = await getPortalCaller().catch(() => null);
  if (!signedIn) return { session: undefined, state: undefined };
  const { caller } = signedIn;

  const portal = await caller.user.getPortalContext().catch(() => null);
  const entries: Prefetch[] = [];
  if (portal) {
    entries.push(["user.getPortalContext", undefined, Promise.resolve(portal)]);
    if (!portal.isAdmin && !portal.isBugTester) {
      entries.push([
        "hackathon.myRegistrations",
        undefined,
        caller.hackathon.myRegistrations(),
      ]);
    }
  }

  // Only what the browser's own session carries, never the session token.
  const { user, expires } = signedIn.session;
  const session: Session = {
    expires: expires ?? "",
    user: {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      image: user?.image,
    } as Session["user"],
  };
  return { session, state: await dehydratePrefetched(entries) };
}
