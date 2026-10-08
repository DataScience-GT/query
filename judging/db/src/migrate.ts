import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

const MIGRATION_TABLE = `
  create table if not exists panel_migration (
    id text primary key,
    applied_at timestamptz not null default now()
  )
`;

/** Applies committed SQL files in order. Each file runs in one transaction. */
export async function migrate(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query(MIGRATION_TABLE);
    const applied = await client.query<{ id: string }>(
      "select id from panel_migration",
    );
    const done = new Set(applied.rows.map((row) => row.id));
    const files = await migrationFiles();
    const fresh: string[] = [];

    for (const file of files) {
      if (done.has(file)) continue;
      const body = await readFile(join(migrationsDir, file), "utf8");
      try {
        await client.query("begin");
        await client.query(body);
        await client.query("insert into panel_migration (id) values ($1)", [
          file,
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      fresh.push(file);
    }
    return fresh;
  } finally {
    client.release();
  }
}

export async function appliedMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    const exists = await client.query<{ present: boolean }>(
      `select to_regclass('panel_migration') is not null as present`,
    );
    const row = exists.rows[0];
    if (!row?.present) return [];
    const applied = await client.query<{ id: string }>(
      "select id from panel_migration order by id",
    );
    return applied.rows.map((item) => item.id);
  } finally {
    client.release();
  }
}

export async function migrationFiles(): Promise<string[]> {
  const files = await readdir(migrationsDir);
  return files.filter((name) => name.endsWith(".sql")).sort();
}
