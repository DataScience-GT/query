import { NextRequest, NextResponse } from "next/server";
import { db, verificationTokens, users, sessions } from "@query/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * Custom email verification endpoint.
 *
 * Our sendVerificationRequest stores a separate token that we control.
 * This endpoint looks up that token directly — no dependency on NextAuth's
 * internal hashing mechanism.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tokenParam = searchParams.get("token");
    const email = searchParams.get("email");
    const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://datasciencegt.org";

    if (!tokenParam || !email) {
        return NextResponse.redirect(`${baseUrl}/auth/error?error=Configuration`);
    }

    try {
        if (!db) {
            console.error("[verify-email] Database connection not available");
            return NextResponse.redirect(`${baseUrl}/auth/error?error=Configuration`);
        }

        // Look up the token directly — our sendVerificationRequest stores
        // the token value as-is (no hashing) with a "custom:" prefix
        const customTokenValue = `custom:${tokenParam}`;

        console.log(`[verify-email] Starting verification for ${email}`);

        // Use raw SQL to avoid potential Drizzle schema/type mismatches (e.g. "boolin" error)
        // Table name is "verificationToken" (singular) per schema definition
        const result = await db.execute(sql`
            DELETE FROM "verificationToken"
            WHERE "identifier" = ${email} AND "token" = ${customTokenValue}
            RETURNING *
        `);

        if (result.rowCount === 0) {
            console.warn(`[verify-email] No matching token found for ${email} — link may be expired or already used`);
            return NextResponse.redirect(`${baseUrl}/auth/error?error=Verification`);
        }

        // Force cast to expected type
        const invite = result.rows[0] as typeof verificationTokens.$inferSelect;

        console.log(`[verify-email] Token found and consumed.`);

        // Check expiry
        if (new Date(invite.expires) < new Date()) {
            return NextResponse.redirect(`${baseUrl}/auth/error?error=Verification`);
        }

        // Find or create user
        let user = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .then((r) => r[0] ?? null);

        if (!user) {
            const newId = crypto.randomUUID();
            const inserted = await db
                .insert(users)
                .values({ id: newId, email, emailVerified: new Date() })
                .returning();
            user = inserted[0]!;
        } else if (!user.emailVerified) {
            await db
                .update(users)
                .set({ emailVerified: new Date() })
                .where(eq(users.id, user.id));
        }

        // Create a database session
        const sessionToken = crypto.randomUUID();
        const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await db.insert(sessions).values({
            sessionToken,
            userId: user.id,
            expires: sessionExpires,
        });

        // Build redirect response with session cookie
        const redirectUrl = callbackUrl.startsWith("http") ? callbackUrl : `${baseUrl}${callbackUrl}`;
        const response = NextResponse.redirect(redirectUrl);

        // Set the session cookie (same name NextAuth uses)
        const isSecure = baseUrl.startsWith("https");
        const cookieName = isSecure
            ? "__Secure-authjs.session-token"
            : "authjs.session-token";

        response.cookies.set(cookieName, sessionToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: isSecure,
            path: "/",
            expires: sessionExpires,
        });

        return response;
    } catch (error: any) {
        console.error("[verify-email] Error:", error);
        return NextResponse.redirect(`${baseUrl}/auth/error?error=Verification`);
    }
}
