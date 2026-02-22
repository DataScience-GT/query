import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { db } from "../src/client";
import * as schema from "../src/schemas";
import { eq, sql } from "drizzle-orm";

async function main() {
    if (!db) {
        throw new Error("Database connection not initialized");
    }

    const allHackathons = await db.query.hackathons.findMany({
        where: eq(schema.hackathons.name, "Hackathon 2026")
    });
    const hackathon = allHackathons[0];

    // Fetch all projects in the DB for this hackathon
    const dbProjects = await db.query.judgingProjects.findMany({
        where: eq(schema.judgingProjects.hackathonId, hackathon.id),
    });

    // Fetch assignment counts per project
    const assignments = await db.select({
        projectId: schema.judgeQueue.projectId,
        count: sql<number>`count(*)`.mapWith(Number)
    })
        .from(schema.judgeQueue)
        .where(eq(schema.judgeQueue.hackathonId, hackathon.id))
        .groupBy(schema.judgeQueue.projectId);

    const assignmentMap = new Map(assignments.map(a => [a.projectId, a.count]));

    // Fetch judge project counts
    const judgeLoads = await db.select({
        judgeId: schema.judgeQueue.judgeId,
        count: sql<number>`count(*)`.mapWith(Number)
    })
        .from(schema.judgeQueue)
        .where(eq(schema.judgeQueue.hackathonId, hackathon.id))
        .groupBy(schema.judgeQueue.judgeId);

    const judgeLoadMap = new Map(judgeLoads.map(j => [j.judgeId, j.count]));

    const missingAssignments = [];
    const lowAssignments = [];
    const highAssignments = [];
    const fullyAssigned = [];

    for (const project of dbProjects) {
        const count = assignmentMap.get(project.id) || 0;
        if (count === 0) {
            missingAssignments.push(project.name);
        } else if (count < 2) {
            lowAssignments.push({ name: project.name, count });
        } else if (count > 3) {
            highAssignments.push({ name: project.name, count });
        } else {
            fullyAssigned.push(project.name);
        }
    }

    console.log(`Project Coverage Summary:`);
    console.log(`- Total Projects in DB: ${dbProjects.length}`);
    console.log(`- Projects with 0 judges: ${missingAssignments.length}`);
    console.log(`- Projects with 1 judge (FAIL): ${lowAssignments.length}`);
    console.log(`- Projects with 2-3 judges (SUCCESS): ${fullyAssigned.length}`);
    console.log(`- Projects with > 3 judges (WARNING): ${highAssignments.length}`);

    // Fetch all judges in DB
    const dbJudges = await db.query.judges.findMany({
        with: {
            user: { columns: { name: true, email: true } }
        }
    });

    const overloadedJudges = [];
    for (const judge of dbJudges) {
        const load = judgeLoadMap.get(judge.id) || 0;
        if (load > 9) {
            overloadedJudges.push({ name: judge.user?.name || judge.name, load });
        }
    }

    console.log(`\nJudge Load Summary:`);
    console.log(`- Total Judges: ${dbJudges.length}`);
    console.log(`- Overloaded Judges (> 9 projects): ${overloadedJudges.length}`);

    if (overloadedJudges.length > 0) {
        console.log(`\nOverloaded Judges:`);
        overloadedJudges.sort((a, b) => b.load - a.load).forEach(oj => console.log(`  - ${oj.name} (${oj.load} projects)`));
    }

    if (missingAssignments.length > 0) {
        console.log(`\nMissing Projects:`);
        missingAssignments.forEach(name => console.log(`  - ${name}`));
    }

    if (lowAssignments.length > 0) {
        console.log(`\nCritically Low Assignment Projects (< 2):`);
        lowAssignments.forEach(la => console.log(`  - ${la.name} (${la.count} judges)`));
    }
}

main().catch(console.error).finally(() => process.exit(0));
