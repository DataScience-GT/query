import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schemas";

// DATABASE_URL should be set via Next.js env loading or Firebase Functions config
const DATABASE_URL = process.env.DATABASE_URL;

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

let db: DrizzleDB | null = null;

if (DATABASE_URL) {
  const conn =
    globalForDb.conn ??
    new Pool({
      connectionString: DATABASE_URL,
      allowExitOnIdle: true,
      /**
       * Fail fast rather than sit on a Cloud Run request slot.
       *
       * At concurrency 80 against `max` connections, a saturated pool queues
       * the rest. Waiting ten seconds for a checkout means each waiter holds
       * its request slot for ten seconds and then surfaces a masked "an
       * unexpected error occurred" anyway — so the instance spends its
       * capacity on requests that were always going to fail. Three seconds
       * returns the slot while a retry can still succeed.
       */
      connectionTimeoutMillis: Number(
        process.env.DB_CONNECTION_TIMEOUT_MS ?? 3000,
      ),
      idleTimeoutMillis: 10000, // 10s idle timeout
      /**
       * Kept warm. pg-pool's reaper drains to `min` (0 by default), so raising
       * idleTimeoutMillis alone does nothing — every burst after a quiet spell
       * paid a fresh connection handshake before it could run a query.
       */
      min: 2,
      /**
       * The open question here was whether the connection string points at
       * Neon's pooled endpoint. It does — the host ends in `-pooler` — so the
       * ceiling is PgBouncer's, which is thousands of client connections, not
       * a compute's max_connections.
       *
       * At concurrency 80 a cap of 10 meant a burst queued 70 requests behind
       * 10 connections, and connectionTimeoutMillis then failed the ones that
       * waited longest. 20 halves that queue while 10 instances x 20 is still
       * far inside what the pooler serves. Still env-tunable, so it can be put
       * back from config without a redeploy.
       */
      max: Number(process.env.DB_POOL_MAX ?? 20),
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: true }
          : undefined,
    });

  if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

  db = drizzle(conn, { schema });
} else {
  // Deliberate startup diagnostic: `db` stays null instead of throwing so
  // builds that never touch the database still succeed, which makes this the
  // only signal that the variable is missing.
  // eslint-disable-next-line no-console
  console.warn("DATABASE_URL not set - database operations will fail");
}

export { db };
