import { NextRequest, NextResponse } from "next/server";
import { db, verificationTokens, users, sessions } from "@query/db";
import { eq, and } from "drizzle-orm";

/**
 * Custom email verification endpoint that bypasses NextAuth's callback.
 *
 * NextAuth's built-in email callback fails silently in this deployment.
 * This endpoint replicates the exact same logic:
 *   1. Hash the raw token with AUTH_SECRET (Web Crypto SHA-256)
 *   2. Look up the hashed token + identifier in the DB
 *   3. Delete the token (one-time use)
 *   4. Create a database session for the user
 *   5. Set the session cookie and redirect to dashboard
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const rawToken = searchParams.get("token");
    const email = searchParams.get("email");
    const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

    if (!rawToken || !email) {
        return NextResponse.redirect(new URL("/auth/error?error=Configuration", request.url));
    }

    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

    try {
        // Hash the token the same way @auth/core does (Web Crypto SHA-256)
        const data = new TextEncoder().encode(`${rawToken}${secret}`);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashedToken = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        // Look up and delete the token (one-time use)
        if (!db) {
            return NextResponse.redirect(new URL("/auth/error?error=Configuration", request.url));
        }

        const result = await db
            .delete(verificationTokens)
            .where(
                and(
                    eq(verificationTokens.identifier, email),
                    eq(verificationTokens.token, hashedToken)
                )
            )
            .returning();

        if (result.length === 0) {
            // Token not found — expired, already used, or hash mismatch
            return NextResponse.redirect(new URL("/auth/error?error=Verification", request.url));
        }

        const invite = result[0];

        // Check expiry
        if (new Date(invite.expires) < new Date()) {
            return NextResponse.redirect(new URL("/auth/error?error=Verification", request.url));
        }

        // Find or create user
        let user = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .then((r) => r[0] ?? null);

        if (!user) {
            // Create new user
            const newId = crypto.randomUUID();
            const inserted = await db
                .insert(users)
                .values({ id: newId, email, emailVerified: new Date() })
                .returning();
            user = inserted[0];
        } else if (!user.emailVerified) {
            // Mark email as verified
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
        const redirectUrl = new URL(callbackUrl, request.url);
        const response = NextResponse.redirect(redirectUrl);

        // Set the session cookie (same name NextAuth uses)
        const isProduction = process.env.NODE_ENV === "production";
        const cookieName = isProduction
            ? "__Secure-authjs.session-token"
            : "authjs.session-token";

        response.cookies.set(cookieName, sessionToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            path: "/",
            expires: sessionExpires,
        });

        return response;
    } catch (error) {
        console.error("[verify-email] Error:", error);
        return NextResponse.redirect(new URL("/auth/error?error=Verification", request.url));
    }
}
