import { Pool } from "pg";
import * as dotenv from "dotenv";
import path from "path";
import { execSync } from "child_process";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function reset() {
    console.log("Resetting database...");

    try {
        // Drop and recreate public schema to clear everything
        await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;");
        console.log("Database cleared.");

        // Push schema to restore tables
        console.log("Pushing schema...");
        execSync("pnpm migrate:push", {
            stdio: "inherit",
            cwd: path.resolve(__dirname, "..")
        });
        console.log("Schema pushed.");

    } catch (error) {
        console.error("Reset failed:", error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

reset();
