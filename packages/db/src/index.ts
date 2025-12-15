import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connection = process.env.DATABASE_URL;

const pool = new Pool({ connectionString: connection });
export const db = drizzle(pool, { schema });
export * from "drizzle-orm";
export * from "./schema";