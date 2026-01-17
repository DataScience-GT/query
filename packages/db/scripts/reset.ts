import { db } from "../src/index";
import { sql } from "drizzle-orm";

async function reset() {
  console.log("🗑️  Dropping all tables...");

  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);

  console.log("✅ Database reset complete!");
  console.log("🔄 Now run: npm run migrate:push");
}

reset()
  .catch((error) => {
    console.error("❌ Reset failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });