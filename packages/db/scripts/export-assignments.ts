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

    console.log("Fetching judges, users, and assigned projects...");

    // Get the core hackathon (Hackathon 2026)
    const allHackathons = await db.query.hackathons.findMany({
        where: eq(schema.hackathons.name, "Hackathon 2026")
    });

    if (allHackathons.length === 0) {
        throw new Error("Hackathon 2026 not found");
    }
    const hackathon = allHackathons[0];

    // Fetch all judges with their user data
    const judges = await db.query.judges.findMany({
        with: {
            user: true
        }
    });

    // Fetch all judge queue assignments with the corresponding project data
    const queue = await db.query.judgeQueue.findMany({
        where: eq(schema.judgeQueue.hackathonId, hackathon.id),
        with: {
            project: true
        }
    });

    const judgeAssignmentsMap = new Map<string, any[]>();

    for (const entry of queue) {
        if (!entry.project || !entry.judgeId) continue;

        if (!judgeAssignmentsMap.has(entry.judgeId)) {
            judgeAssignmentsMap.set(entry.judgeId, []);
        }

        judgeAssignmentsMap.get(entry.judgeId)!.push(entry.project);
    }

    const csvRows = [
        ["Judge Name", "Judge Email", "Project Name", "Project Zone", "Project Table", "Project Track", "Sponsor Challenges", "Project URL"]
    ];

    for (const judge of judges) {
        const assignedProjects = judgeAssignmentsMap.get(judge.id) || [];

        if (assignedProjects.length === 0) {
            continue; // Skip judges with no assignments for this output
        }

        for (const proj of assignedProjects) {
            const challengesStr = Array.isArray(proj.challenges) ? proj.challenges.join("; ") : "";
            csvRows.push([
                `"${judge.name || 'Unknown'}"`,
                `"${judge.user?.email || 'No Email'}"`,
                `"${proj.name}"`,
                `"${proj.zone || ''}"`,
                `"${proj.tableNumber}"`,
                `"${proj.tracks?.[0] || 'NONE'}"`,
                `"${challengesStr}"`,
                `"${proj.projectUrl || ''}"`
            ]);
        }
    }

    const csvContent = csvRows.map(row => row.join(",")).join("\n");
    const outputPath = path.resolve(__dirname, "judge_assignments_export.csv");

    fs.writeFileSync(outputPath, csvContent);
    console.log(`Successfully exported ${csvRows.length - 1} assignments to ${outputPath}`);

}

main().catch(console.error).finally(() => process.exit(0));
