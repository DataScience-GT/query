import { db } from "@query/db";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { cache } from "./middleware/cache";

type Session = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires?: string;
} | null;

// Lazy import auth to avoid module resolution issues in standalone builds
let authModule: { auth: () => Promise<Session> } | null = null;

async function getAuth() {
  if (authModule === null) {
    try {
      authModule = await import("@query/auth");
    } catch (error) {
      console.warn("Auth module not available:", error);
      authModule = { auth: async () => null };
    }
  }
  return authModule.auth;
}

export async function createContext(
  opts?: FetchCreateContextFnOptions & { clientIp?: string; req?: Request }
) {
  let session = null;

  // Extract request from opts if available
  const req = opts?.req;

  // Only attempt auth if database is available
  if (db) {
    try {
      const auth = await getAuth();
      session = await auth();
    } catch (error) {
      console.warn("Failed to fetch auth session:", error);
    }
  }

  return {
    db,
    session,
    userId: session?.user?.id,
    cache,
    clientIp: opts?.clientIp || 'unknown',
    req
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;