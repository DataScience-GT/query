import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { db } from "../src/client";
import * as schema from "../src/schemas";
import { eq } from "drizzle-orm";

async function main() {
    if (!db) {
        throw new Error("Database connection not initialized");
    }

    const allHackathons = await db.query.hackathons.findMany({
        where: eq(schema.hackathons.name, "Hackathon 2026")
    });
    const hackathon = allHackathons[0];

    // Fetch judges and assignments
    const judges = await db.query.judges.findMany({
        where: eq(schema.judges.isActive, true),
        with: {
            assignments: {
                where: eq(schema.judgeAssignments.hackathonId, hackathon.id)
            }
        }
    });

    const activeJudgesWithValidTrack = judges.filter(j => j.assignments.length > 0);
    console.log(`Total active judges assigned to at least one track: ${activeJudgesWithValidTrack.length}`);
    console.log(`Maximum capacity with 7 projects/judge: ${activeJudgesWithValidTrack.length * 7}`);

    const csvPath = path.resolve(__dirname, "Hacklytics 2026_ Planned Submission Form.csv");
    const csvText = fs.readFileSync(csvPath, "utf-8");
    const rows = csvText.split("\n").filter(r => r.trim() !== "");
    // rough count of projects:
    const data = rows.slice(1).filter(r => r.split(",").length > 5 && r.split(",")[1].trim() !== "");
    console.log(`Total projects in CSV: ${data.length}`);
    console.log(`Required capacity for 3 judges/project: ${data.length * 3}`);
    console.log(`Required capacity for 4 judges/project: ${data.length * 4}`);
}

main().catch(console.error).finally(() => process.exit(0));
