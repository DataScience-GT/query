
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
    const { db } = await import("../src/client");
    const { users, judges } = await import("../src/schemas");
    const { eq } = await import("drizzle-orm");

    if (!db) {
        throw new Error("DB connection failed");
    }

    const email = "aamoghsawantt@gmail.com";
    const foundUsers = await db.select().from(users).where(eq(users.email, email));

    const allJudges = await db.select().from(judges);
    const targetJudge = allJudges.find(j =>
        foundUsers.some(u => u.id === j.userId) || j.name?.includes("Aamogh")
    );

    const findings = {
        foundUsers,
        targetJudge
    };

    const fs = await import("fs");
    fs.writeFileSync("findings.json", JSON.stringify(findings, null, 2));
    process.exit(0);
}

main();
