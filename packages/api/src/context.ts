import { auth } from "@query/auth";
import { db } from "@query/db";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { cache } from "./middleware/cache";

export async function createContext(
  opts?: FetchCreateContextFnOptions & { clientIp?: string }
) {
  const session = await auth();

  return {
    db,
    session,
    userId: session?.user?.id,
    cache,
    clientIp: opts?.clientIp || 'unknown',
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;