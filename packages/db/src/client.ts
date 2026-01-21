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
    connectionTimeoutMillis: 5000, // 5s timeout
    idleTimeoutMillis: 2000, // 2s idle timeout
    max: 10,
  });

  if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

  db = drizzle(conn, { schema });
} else {
  console.warn("DATABASE_URL not set - database operations will fail");
}

export { db };