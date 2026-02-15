import { NextResponse } from "next/server";
import { db, verificationTokens } from "@query/db";
import { eq, and } from "drizzle-orm";

// Temporary debug endpoint — tests the complete token flow
// DELETE THIS AFTER DEBUGGING
export async function GET() {
    const logs: string[] = [];

    try {
        // Step 1: Generate a test token the same way NextAuth does (Web Crypto)
        const rawToken = "debug_test_" + Date.now();
        const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
        const testEmail = "debug_test@test.com";

        logs.push(`Raw token: ${rawToken}`);
        logs.push(`Secret first 5: ${secret.substring(0, 5)}`);

        // Hash using Web Crypto (same as @auth/core createHash)
        const data = new TextEncoder().encode(`${rawToken}${secret}`);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashedToken = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        logs.push(`Hashed token: ${hashedToken.substring(0, 30)}...`);

        // Step 2: Insert token into DB
        try {
            await db.insert(verificationTokens).values({
                identifier: testEmail,
                token: hashedToken,
                expires: new Date(Date.now() + 86400000),
            });
            logs.push("✅ Insert: SUCCESS");
        } catch (e: any) {
            logs.push(`❌ Insert: FAILED — ${e.message}`);
            return NextResponse.json({ logs, status: "INSERT_FAILED" });
        }

        // Step 3: Look up token (same as useVerificationToken)
        try {
            const result = await db
                .delete(verificationTokens)
                .where(
                    and(
                        eq(verificationTokens.identifier, testEmail),
                        eq(verificationTokens.token, hashedToken)
                    )
                )
                .returning();

            if (result.length > 0) {
                logs.push("✅ Lookup: FOUND AND DELETED — token flow WORKS");
            } else {
                logs.push("❌ Lookup: NOT FOUND — this is the bug!");
            }
        } catch (e: any) {
            logs.push(`❌ Lookup: ERROR — ${e.message}`);
        }

        // Step 4: Check if there are ANY tokens currently in the DB
        const allTokens = await db.select().from(verificationTokens);
        logs.push(`\nAll tokens in DB: ${allTokens.length}`);
        for (const t of allTokens) {
            const expired = new Date(t.expires) < new Date();
            logs.push(`  - ${t.identifier} | hash: ${t.token.substring(0, 16)}... | expired: ${expired}`);
        }

        return NextResponse.json({ logs, status: "COMPLETE" });

    } catch (e: any) {
        logs.push(`Fatal error: ${e.message}`);
        return NextResponse.json({ logs, status: "ERROR" });
    }
}
