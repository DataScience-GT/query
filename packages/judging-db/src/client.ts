import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url, max: 10 });
  pool.on("error", () => {
    // The pool drops a dead client on its own. An unhandled "error" event
    // would take the process down.
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type PanelDb = ReturnType<typeof createDb>["db"];
export type PanelTx = Parameters<Parameters<PanelDb["transaction"]>[0]>[0];
