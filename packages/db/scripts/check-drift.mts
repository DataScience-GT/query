/**
 * Fails if a table, column or unique constraint declared in `src/schemas` is
 * missing from the database. Drizzle selects every declared column, so one
 * absent column breaks every read of that table. Unique indexes are checked
 * because the code leans on them for idempotency (23505 handling, "safe to
 * re-run"), and `drizzle-kit push < /dev/null` skips one that needs
 * confirmation — duplicates already in the table — while still exiting 0.
 * Types and plain indexes are not checked.
 */
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

import pg from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schemaNamespace from "../src/schemas";

/**
 * The schema modules are CommonJS — this package declares no `"type":
 * "module"` — so `import * as` from this .mts file hands back the interop
 * namespace `{ default, "module.exports" }` rather than the table exports.
 * Iterating that namespace directly found zero tables, `getTableConfig` threw
 * on both entries, and every one was skipped by the catch below: the check
 * reported "every declared table and column exists" against an empty set and
 * could never fail. Unwrap `default`, which is the real module.exports.
 */
const schema = (
  (schemaNamespace as { default?: Record<string, unknown> }).default ??
  schemaNamespace
) as Record<string, unknown>;

if (Object.keys(schema).length === 0) {
  console.error("No schema exports found — the drift check would pass blindly.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query<{
  table_name: string;
  column_name: string;
}>(
  `select table_name, column_name
   from information_schema.columns
   where table_schema = 'public'`,
);

// A unique constraint is backed by an index of the same name, so pg_indexes
// covers both forms.
const { rows: indexRows } = await client.query<{ indexname: string }>(
  `select indexname from pg_indexes where schemaname = 'public'`,
);
const liveIndexes = new Set(indexRows.map((row) => row.indexname));

const live = new Map<string, Set<string>>();
for (const row of rows) {
  if (!live.has(row.table_name)) live.set(row.table_name, new Set());
  live.get(row.table_name)!.add(row.column_name);
}

const problems: string[] = [];

for (const exported of Object.values(schema)) {
  let table;
  try {
    // Non-table exports (relations, constants) throw here.
    table = getTableConfig(exported as never);
  } catch {
    continue;
  }

  const columns = live.get(table.name);
  if (!columns) {
    problems.push(`table "${table.name}" is missing entirely`);
    continue;
  }

  const missing = table.columns
    .map((column) => column.name)
    .filter((name) => !columns.has(name));

  if (missing.length > 0) {
    problems.push(`table "${table.name}" is missing: ${missing.join(", ")}`);
  }

  const uniques = [
    ...table.indexes
      .filter((index) => index.config.unique)
      .map((index) => index.config.name),
    ...table.uniqueConstraints.map((constraint) => constraint.getName()),
    ...table.columns
      .filter((column) => column.isUnique)
      .map((column) => column.uniqueName),
  ].filter((name): name is string => !!name);

  const missingUniques = uniques.filter((name) => !liveIndexes.has(name));
  if (missingUniques.length > 0) {
    problems.push(
      `table "${table.name}" is missing unique constraint(s): ${missingUniques.join(", ")} — remove the duplicate rows, then push again`,
    );
  }
}

await client.end();

if (problems.length > 0) {
  console.error("Schema drift — the database is behind src/schemas:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nRun `pnpm --filter @query/db migrate:push` to apply.");
  process.exit(1);
}

console.log(
  "Schema check passed: every declared table, column and unique constraint exists.",
);
