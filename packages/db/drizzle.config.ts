import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load .env from root (two levels up)
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env file");
}

// Judging (packages/judging-db) keeps its tables in this database and applies
// them with its own SQL migrations. Left visible, push sees them as tables to
// drop and stops at a prompt; the build has no TTY, so the prompt errors, push
// exits 0, and every club schema change after that is silently skipped.
// The list comes from the migration files, so a new judging table is covered.
const judgingMigrations = path.resolve(__dirname, "../judging-db/migrations");
const judgingTables = [
  "panel_migration",
  ...fs
    .readdirSync(judgingMigrations)
    .filter((file) => file.endsWith(".sql"))
    .flatMap((file) =>
      [
        ...fs
          .readFileSync(path.join(judgingMigrations, file), "utf8")
          .matchAll(/^create table (\w+)/gm),
      ].map((match) => match[1] as string),
    ),
];

export default defineConfig({
  schema: ["./src/schemas/**/*.ts", "../judging-db/src/enums.ts"],
  tablesFilter: judgingTables.map((table) => `!${table}`),
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
