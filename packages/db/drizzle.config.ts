import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import path from "path";

// Load .env from root (two levels up)
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env file");
}

// Tables the retired panel judging service created in this database with its
// own SQL migrations. Nothing reads them. Left visible, push sees them as
// tables to drop and stops at a prompt; the build has no TTY, so the prompt
// errors, push exits 0, and every schema change after it is silently skipped.
// Their enum types are declared in src/schemas/retired.ts for the same reason.
const retiredPanelTables = [
  "panel_migration",
  "organization",
  "panel_user",
  "panel_event",
  "event_config",
  "rubric",
  "criterion",
  "track",
  "prize",
  "zone",
  "floor_table",
  "project",
  "project_track",
  "panel_judge",
  "visit",
  "vote",
  "vote_score",
  "comparison",
  "result_run",
  "result",
  "event_log",
  "outbox",
  "webhook",
  "api_key",
  "membership",
  "judge_identity",
  "login_code",
];

export default defineConfig({
  schema: "./src/schemas/**/*.ts",
  tablesFilter: retiredPanelTables.map((table) => `!${table}`),
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
