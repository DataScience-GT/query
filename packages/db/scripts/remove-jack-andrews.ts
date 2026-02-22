import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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

    const emailToRemove = "omar.garcia@createx.com";
    console.log(`Searching for user with email: ${emailToRemove}`);

    const user = await db.query.users.findFirst({
        where: eq(schema.users.email, emailToRemove)
    });

    if (!user) {
        console.log(`User ${emailToRemove} not found in the database. Proceeding...`);
        return;
    }

    // Delete user (due to DB schemas, this should cascade to judge queues, assignments, etc. or we can delete manually)
    console.log(`Found user ${user.id} (${user.name}). Removing from judges table...`);

    // First remove from judge table
    const judge = await db.query.judges.findFirst({
        where: eq(schema.judges.userId, user.id)
    });

    if (judge) {
        console.log(`Deleting judge assignments for judge ${judge.id}...`);
        await db.delete(schema.judgeAssignments).where(eq(schema.judgeAssignments.judgeId, judge.id));

        console.log(`Deleting judge queue for judge ${judge.id}...`);
        await db.delete(schema.judgeQueue).where(eq(schema.judgeQueue.judgeId, judge.id));

        console.log(`Deleting judge profile ${judge.id}...`);
        await db.delete(schema.judges).where(eq(schema.judges.id, judge.id));
    }

    console.log(`Deleting user profile ${user.id}...`);
    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    console.log(`Successfully removed Jack Andrews from the database.`);
}

main().catch(console.error).finally(() => process.exit(0));
