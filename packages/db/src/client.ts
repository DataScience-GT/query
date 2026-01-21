import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schemas";

// DATABASE_URL should be set via Next.js env loading or Firebase Functions config
const DATABASE_URL = process.env.DATABASE_URL;

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

let db: DrizzleDB | null = null;

if (DATABASE_URL) {
  const conn = globalForDb.conn ?? new Pool({
    connectionString: DATABASE_URL,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 10000, // 10s timeout
    idleTimeoutMillis: 10000, // 10s idle timeout
    max: 10, // Increased from 1 to 10 to prevent starvation in dev/HMR
  });

  if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

  db = drizzle(conn, { schema });
} else {
  console.warn("DATABASE_URL not set - database operations will fail");
}

export { db };