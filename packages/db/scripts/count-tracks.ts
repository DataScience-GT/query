import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { db } from "../src/client";
import { judgingProjects } from "../src/schemas";
import { sql } from "drizzle-orm";

async function main() {
    const result = await db.execute(sql`SELECT tracks[1] as main_track, count(*) FROM judging_project GROUP BY tracks[1]`);
    console.log(result.rows);
}

main().catch(console.error).finally(() => process.exit(0));
