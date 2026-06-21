import type { Context } from "../context";
import { cache } from "../middleware/cache";
import { db } from "@query/db";

type MockContextOptions = {
  userId?: string;
  clientIp?: string;
  headers?: Record<string, string>;
};

/** Builds a tRPC context for unit/integration tests. */
export function createMockContext(
  options: MockContextOptions = {},
): Context {
  const { userId, clientIp = "127.0.0.1", headers = {} } = options;

  return {
    db,
    session: userId ? { user: { id: userId } } : null,
    userId,
    cache,
    clientIp,
    req: {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    } as Context["req"],
  };
}
