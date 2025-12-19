import { auth } from "@query/auth";
import { db } from "@query/db";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

export async function createContext(opts?: FetchCreateContextFnOptions) {
  const session = await auth();

  return {
    db,
    session,
    userId: session?.user?.id,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;