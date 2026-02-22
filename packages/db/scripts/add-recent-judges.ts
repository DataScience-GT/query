import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { db } from "../src/client";
import * as schema from "../src/schemas";
import { eq, sql, and, notInArray } from "drizzle-orm";

async function main() {
    if (!db) {
        throw new Error("Database connection not initialized");
    }

    const allHackathons = await db.query.hackathons.findMany({
        where: eq(schema.hackathons.name, "Hackathon 2026")
    });
    const hackathon = allHackathons[0];

    // Format: [name, email, tracks[]]
    const newJudges = [
        ["Omar García Urdiales", "ourdiales3@gatech.edu", ["CREATE-X"]],
        ["Jack Bisher", "jack.bisher@nlplogix.com", ["FINANCE", "HEALTHCARE", "ANY"]],
        ["Caroline Liu", "caroline@sphinx.ai", ["SPHINX"]],
        ["Nathan Knox", "nathan@databricks.com", ["DATABRICKS"]],
        ["Elise Hollowed", "elise.hollowed@databricks.com", ["DATABRICKS"]],
        ["Tarek", "tarek.madkour@databricks.com", ["DATABRICKS"]],
        ["Prince P", "princep@beecorp.ai", ["ANY"]],
        ["Oscar Martinez", "oscar.martinez@coxautoinc.com", ["ANY"]],
        ["Pravallika Mannem", "pravi.sit05@gmail.com", ["ANY"]],
        ["Rajesh Daruvuri", "rajesh.daruvuri@gmail.com", ["ANY"]],
        ["Akshai Subramanian", "akshais@beecorp.ai", ["ANY"]],
        ["Taran Agnihotri", "tarana@beecorp.ai", ["ANY"]],
        ["Pratham Mehta", "pratham.mehta001@gmail.com", ["FIGMA"]],
        ["Actian Judge", "gheise@tractian.com", ["TRACTIAN"]],
        ["Cprice Actian", "cprice@tractian.com", ["TRACTIAN"]],
        // New batch
        ["Nainsi Jain", "nainsijain1591@gmail.com", ["ANY"]],
        ["Harsh Jangid", "harshjangid1015@gmail.com", ["ANY"]],
        ["Devendra Devra", "devendradevra33@gmail.com", ["ANY"]],
        ["Chala Koneni", "chala.koneni@gmail.com", ["ANY"]],
        ["Gopi Anoop", "gopi.anoop@gmail.com", ["ANY"]],
        ["Kashish Mittal", "kashishmittal55@gmail.com", ["ANY"]],
        ["M Waldrop", "mwaldrop@nvidia.com", ["ANY"]],
        ["SafetyKit Dev", "dev@safetykit.com", ["ANY"]],
        ["Karthik", "karthidec@gmail.com", ["ANY"]],
        ["Kasheef Ali", "kasheefalir@gmail.com", ["ANY"]],
        ["Danniecia Gray", "dannieciagray@gmail.com", ["ANY"]],
        ["Sujatha Narra", "sujathanarra87@gmail.com", ["ANY"]],
        ["Eric D", "ericd@beecorp.ai", ["ANY"]],
        ["Akshai S", "akshai.subramanian@gmail.com", ["ANY"]],
        ["Jake Boy", "jakeyboy@gmail.com", ["ANY"]],
    ];

    console.log(`Adding ${newJudges.length} special judges...`);

    for (const j of newJudges) {
        const [name, email, tracks] = j as [string, string, string[]];

        let dbUser = await db.query.users.findFirst({
            where: eq(schema.users.email, email)
        });

        if (!dbUser) {
            console.log(`Creating user ${email}...`);
            const [newUser] = await db.insert(schema.users).values({
                id: `user-${email.split('@')[0]}-${Date.now()}`,
                name: name,
                email: email,
                image: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`
            }).returning();
            dbUser = newUser;
        }

        let judgeProfile = await db.query.judges.findFirst({
            where: eq(schema.judges.userId, dbUser.id)
        });

        if (!judgeProfile) {
            console.log(`Creating judge profile for ${name}...`);
            const [newJudge] = await db.insert(schema.judges).values({
                userId: dbUser.id,
                name: name,
                isActive: true
            }).returning();
            judgeProfile = newJudge;
        }

        for (const tr of tracks) {
            const existingAssignment = await db.query.judgeAssignments.findFirst({
                where: (assignment, { and, eq }) => and(
                    eq(assignment.judgeId, judgeProfile!.id),
                    eq(assignment.hackathonId, hackathon.id),
                    eq(assignment.track, tr)
                )
            });

            if (!existingAssignment) {
                console.log(`Assigning ${name} to track ${tr}...`);
                await db.insert(schema.judgeAssignments).values({
                    judgeId: judgeProfile.id,
                    hackathonId: hackathon.id,
                    track: tr,
                });
            }
        }
    }

    console.log("Successfully added the special judges.");

    console.log("Cleaning up orphan assignments and enforcing strict exclusivity...");
    // 1. Remove assignments with null tracks
    await db.delete(schema.judgeAssignments).where(sql`track IS NULL`);

    // 2. Strict Exclusivity Cleanup
    const exclusiveEmails = [
        "ourdiales3@gatech.edu",
        "cprice@tractian.com",
        "gheise@tractian.com",
        "caroline@sphinx.ai",
        "nathan@databricks.com",
        "elise.hollowed@databricks.com",
        "tarek.madkour@databricks.com",
        "pratham.mehta001@gmail.com"
    ];

    for (const email of exclusiveEmails) {
        const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
        if (!user) continue;
        const judge = await db.query.judges.findFirst({ where: eq(schema.judges.userId, user.id) });
        if (!judge) continue;

        // Find the "legit" track from our newJudges list or just keep the one they should have
        const targetTracks = (newJudges.find(nj => nj[1] === email)?.[2] || []) as string[];

        if (targetTracks.length > 0) {
            console.log(`Enforcing exclusivity for ${email}: keeping only ${targetTracks.join(", ")}`);
            await db.delete(schema.judgeAssignments).where(
                and(
                    eq(schema.judgeAssignments.judgeId, judge.id),
                    eq(schema.judgeAssignments.hackathonId, hackathon.id),
                    notInArray(schema.judgeAssignments.track, targetTracks)
                )
            );
        }
    }

    console.log("Cleanup complete.");
}

main().catch(console.error).finally(() => process.exit(0));
