import { auth } from "@query/auth";
import { db } from "@query/db";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { cache } from "./middleware/cache";

export async function createContext(
  opts?: FetchCreateContextFnOptions & { clientIp?: string; req?: Request }
) {
  let session = null;

  // Extract request from opts if available (priority to explicit req)
  const req = opts?.req || opts?.req;

  // Only attempt auth if database is available
  if (db) {
    try {
      // Pass the request to auth() if available, which helps in some Next.js environments
      // casting simplified as usually auth() picks up headers context automatically in Server Components/Actions
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