import { cache } from "../middleware/cache";
import { appRouter } from "../root";

/**
 * A tRPC context over `db`, for `appRouter.createCaller`. No `userId` is a
 * signed-out caller. `extra` overrides any field; `headers` is what the
 * request's header lookup serves.
 */
export const testCtx = (
  db: unknown,
  userId?: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  ({
    db,
    session: userId ? { user: { id: userId } } : null,
    userId: userId || undefined,
    cache,
    clientIp: "127.0.0.1",
    req: {
      headers: { get: (name: string) => headers[name.toLowerCase()] || null },
    },
    ...extra,
  }) as any;

export const testCaller = (
  db: unknown,
  userId?: string,
  extra?: Record<string, unknown>,
) => appRouter.createCaller(testCtx(db, userId, extra));
