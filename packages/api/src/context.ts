import { db, primePool } from "@query/db";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { cache } from "./middleware/cache";
import { resolveClientIp } from "./middleware/security";

type Session = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires?: string;
} | null;

let authModule: { auth: () => Promise<Session> } | null = null;

async function getAuth() {
  if (authModule === null) {
    try {
      authModule = await import("@query/auth");
    } catch {
      // Auth module not available
      authModule = { auth: async () => null };
    }
  }
  return authModule.auth;
}

export async function createContext(
  opts?: Partial<FetchCreateContextFnOptions> & {
    clientIp?: string;
    req?: Request;
    /** The caller already knows a session cookie is present (server render). */
    primeDb?: boolean;
  },
) {
  let session: Session = null;

  // Extract request from opts if available
  const req = opts?.req;

  // Only attempt auth if database is available
  if (db) {
    // The session read is the first of several queries this request makes.
    // Only a visitor with a session cookie reads it; everyone else may be
    // served from the cache and must not open connections for nothing.
    if (
      opts?.primeDb ||
      /(^|;\s*)(__Secure-)?authjs\.session-token(\.\d+)?=/.test(
        req?.headers.get("cookie") ?? "",
      )
    ) {
      primePool();
    }
    try {
      const auth = await getAuth();
      session = await auth();
    } catch {
      // Failed to fetch auth session
    }
  }

  return {
    db,
    session,
    userId: session?.user?.id,
    cache,
    clientIp:
      opts?.clientIp ||
      resolveClientIp(req?.headers.get("x-forwarded-for")),
    req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
