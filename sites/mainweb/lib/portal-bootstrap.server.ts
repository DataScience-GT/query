import { cache } from "react";
import { cookies, headers } from "next/headers";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { appRouter, createContext, resolveClientIp } from "@query/api";

async function hasSessionCookie() {
  const jar = await cookies();
  return jar.getAll().some((c) => c.name.endsWith("authjs.session-token"));
}

/**
 * The signed-in visitor's tRPC caller for this request, or null when there is
 * none. Cached per request so the layout and a page's prefetch share one
 * session lookup.
 *
 * A visitor with no session cookie (the login page, guest judges, the public
 * hacklytics page) costs nothing here and mounts exactly as before.
 */
export const getPortalCaller = cache(async () => {
  if (!(await hasSessionCookie())) return null;
  const ctx = await createContext({
    clientIp: resolveClientIp((await headers()).get("x-forwarded-for")),
    // The cookie check above passed, so the session read is coming.
    primeDb: true,
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

/** Only what the browser's own session carries, never the session token. */
function browserSession({
  user,
  expires,
}: NonNullable<Awaited<ReturnType<typeof getPortalCaller>>>["session"]) {
  const session: Session = {
    expires: expires ?? "",
    user: {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      image: user?.image,
    } as Session["user"],
  };
  return session;
}

/**
 * Just the session, for pages that mount SessionProvider and nothing else. A
 * failed lookup returns undefined, so the browser asks for it as it would for
 * a visitor with no session.
 */
export async function loadPortalSession() {
  const signedIn = await getPortalCaller().catch(() => null);
  return signedIn ? browserSession(signedIn.session) : undefined;
}

/**
 * What every signed-in portal page needs before it can draw: who is signed in
 * and the two reads the sidebar makes. The client providers get them as a
 * session and dehydrated state, so the browser neither asks /api/auth/session
 * nor makes a tRPC round trip for the portal context after hydration. The
 * sidebar is drawn from the same two reads on the server, so they come back
 * as plain values too. `navFailed` says a read for a visitor with a session
 * cookie failed or found no session, so the nav may have been drawn from less
 * than it should have been.
 */
export async function loadPortalBootstrap() {
  // A failed lookup (the database unreachable, say) must not take the whole
  // portal down with it: fall back to the browser asking, as it did before.
  let navFailed = false;
  const signedIn = await getPortalCaller().catch(() => {
    navFailed = true;
    return null;
  });
  if (!signedIn) {
    // createContext swallows a failed session lookup, so a cookie with no
    // session may be a database blip rather than a signed-out visitor.
    navFailed ||= await hasSessionCookie();
    return {
      session: undefined,
      state: undefined,
      portal: undefined,
      registrations: undefined,
      navFailed,
    };
  }
  const { caller } = signedIn;

  // Both reads start now. The registrations read does not depend on the portal
  // context except to be thrown away for staff, and waiting for it first put a
  // database round trip between them for every non-staff visitor.
  const portalRead = caller.user.getPortalContext();
  const registrationsRead = caller.hackathon.myRegistrations();
  // Settled below only for a non-staff visitor; a discarded read must not
  // surface as an unhandled rejection.
  registrationsRead.catch(() => undefined);
  // The dashboard, club and settings pages prefetch the profile next, and a
  // read already in flight is shared by the cache. Started here it overlaps
  // these two instead of following them. A failure is the page's to report.
  caller.user.me().catch(() => undefined);

  const portal = await portalRead.catch(() => {
    navFailed = true;
    return null;
  });
  const entries: Prefetch[] = [];
  let registrations: typeof registrationsRead | undefined;
  if (portal) {
    entries.push(["user.getPortalContext", undefined, Promise.resolve(portal)]);
    if (!portal.isAdmin && !portal.isBugTester) {
      registrations = registrationsRead;
      entries.push(["hackathon.myRegistrations", undefined, registrations]);
    }
  }

  return {
    session: browserSession(signedIn.session),
    state: await dehydratePrefetched(entries),
    portal: portal ?? undefined,
    registrations: await registrations?.catch(() => {
      navFailed = true;
      return undefined;
    }),
    navFailed,
  };
}
