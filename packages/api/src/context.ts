import { auth } from "@query/auth";
import { db } from "@query/db";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { cache } from "./middleware/cache";

export async function createContext(
  opts?: FetchCreateContextFnOptions & { clientIp?: string }
) {
  let session = null;

  // Only attempt auth if database is available
  if (db) {
    try {
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
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;