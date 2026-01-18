import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schemas";

// DATABASE_URL should be set via Next.js env loading or Firebase Functions config
const DATABASE_URL = process.env.DATABASE_URL;

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

// Create database connection only if DATABASE_URL is provided
let db: DrizzleDB | null = null;

if (DATABASE_URL) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });
  db = drizzle(pool, { schema });
} else {
  console.warn("DATABASE_URL not set - database operations will fail");
}

export { db };