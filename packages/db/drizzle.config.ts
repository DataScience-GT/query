import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import path from "path";

// Load .env from root (two levels up)
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env file");
}

export default defineConfig({
  // One entry file, not a glob: drizzle-kit 1.0 no longer dedupes tables that
  // the glob reaches twice (once in its own file, once through the index
  // re-exports) and refuses to run on "duplicate table name".
  schema: "./src/schemas/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
