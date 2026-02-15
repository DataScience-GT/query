import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createHash } from "crypto";
import * as dotenv from "dotenv";
import path from "path";
import { eq, and } from "drizzle-orm";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { verificationTokens } from "../src/schemas";

const DATABASE_URL = process.env.DATABASE_URL;
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

if (!DATABASE_URL) throw new Error("DATABASE_URL is not defined");
if (!AUTH_SECRET) throw new Error("AUTH_SECRET/NEXTAUTH_SECRET is not defined");

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

async function diagnose() {
    console.log("=== NextAuth Email Verification Diagnostic ===\n");
    console.log(`AUTH_SECRET present: ${!!AUTH_SECRET}`);
    console.log(`AUTH_SECRET (first 10 chars): ${AUTH_SECRET!.substring(0, 10)}...`);
    console.log(`DATABASE_URL present: ${!!DATABASE_URL}\n`);

    // Step 1: Check existing tokens
    console.log("--- Step 1: Checking existing verification tokens ---");
    const existingTokens = await db.select().from(verificationTokens);
    console.log(`Found ${existingTokens.length} existing token(s).`);
    for (const t of existingTokens) {
        const isExpired = new Date(t.expires) < new Date();
        console.log(`  identifier: ${t.identifier}, expired: ${isExpired}, token_hash_start: ${t.token.substring(0, 20)}...`);
    }

    // Step 2: Simulate creating a verification token
    console.log("\n--- Step 2: Simulating token creation ---");
    const rawToken = "test_diagnostic_token_12345";
    const testEmail = "diagnostic@test.com";
    const hashedToken = createHash("sha256")
        .update(`${rawToken}${AUTH_SECRET}`)
        .digest("hex");
    const expires = new Date(Date.now() + 86400 * 1000); // 24 hours

    console.log(`Raw token: ${rawToken}`);
    console.log(`Hashed token: ${hashedToken}`);
    console.log(`Identifier: ${testEmail}`);
    console.log(`Expires: ${expires.toISOString()}`);

    try {
        await db.insert(verificationTokens).values({
            identifier: testEmail,
            token: hashedToken,
            expires,
        });
        console.log("✅ Token inserted successfully");
    } catch (err: any) {
        console.log(`❌ Failed to insert token: ${err.message}`);
        await pool.end();
        return;
    }

    // Step 3: Simulate verification (lookup + delete)
    console.log("\n--- Step 3: Simulating token verification ---");
    const reHashedToken = createHash("sha256")
        .update(`${rawToken}${AUTH_SECRET}`)
        .digest("hex");

    console.log(`Re-hashed token: ${reHashedToken}`);
    console.log(`Hashes match: ${hashedToken === reHashedToken}`);

    try {
        const result = await db
            .delete(verificationTokens)
            .where(
                and(
                    eq(verificationTokens.identifier, testEmail),
                    eq(verificationTokens.token, reHashedToken)
                )
            )
            .returning();

        if (result.length > 0) {
            console.log("✅ Token found and deleted successfully — verification WOULD work!");
        } else {
            console.log("❌ Token NOT found — verification WOULD fail!");
            console.log("   This means the hash comparison is failing in the DB");
        }
    } catch (err: any) {
        console.log(`❌ Error during verification: ${err.message}`);
    }

    // Step 4: Re-check if the token was cleaned up
    console.log("\n--- Step 4: Post-cleanup check ---");
    const remaining = await db.select().from(verificationTokens);
    console.log(`Remaining tokens: ${remaining.length}`);

    console.log("\n=== Diagnostic complete ===");
    await pool.end();
}

diagnose().catch(console.error);
