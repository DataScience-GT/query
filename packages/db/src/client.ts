import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
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
      // Fail fast rather than sit on a Cloud Run request slot. At concurrency 80 a
      // saturated pool queues the rest, and a ten-second wait means each waiter
      // holds its slot for ten seconds and then surfaces a masked error anyway.
      // Three seconds returns the slot while a retry can still succeed.
      connectionTimeoutMillis: Number(
        process.env.DB_CONNECTION_TIMEOUT_MS ?? 3000,
      ),
      // Long enough to reuse connections across a burst, well under Neon's
      // five-minute scale-to-zero window.
      idleTimeoutMillis: 60000,
      // Not kept warm by default. Held idle connections stop Neon scaling to zero,
      // and on the free plan that burned the monthly compute-hour allowance. The
      // cost is a fresh handshake on the first query after a quiet spell. Set
      // DB_POOL_MIN on a paid plan to keep connections open again.
      min: Number(process.env.DB_POOL_MIN ?? 0),
      // The connection string points at Neon's pooled endpoint (the host ends in
      // `-pooler`), so the ceiling is PgBouncer's — thousands of client
      // connections, not a compute's max_connections. At concurrency 80 a cap of 10
      // queued 70 requests behind 10 connections; 20 halves that and 10 instances
      // x 20 is still far inside what the pooler serves. Env-tunable.
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

/**
 * Opens the connections the pool retains, before a request needs one.
 *
 * `min` stops the reaper closing idle clients but never opens any, so on a
 * fresh instance the first requests paid the Neon handshake themselves. Issued
 * in parallel — one query opens one socket — and failures are swallowed.
 */
export async function warmPool(): Promise<number> {
  const pool = db;
  if (!pool) return 0;

  const target = Number(process.env.DB_POOL_MIN ?? 0);
  const probes = Array.from({ length: Math.max(1, target) }, async () => {
    try {
      await pool.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  });

  const results = await Promise.all(probes);
  return results.filter(Boolean).length;
}

export { db };
