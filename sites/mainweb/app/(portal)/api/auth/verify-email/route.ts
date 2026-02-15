import { NextRequest, NextResponse } from "next/server";
import { db, verificationTokens, users, sessions } from "@query/db";
import { eq, and } from "drizzle-orm";

/**
 * Custom email verification endpoint that bypasses NextAuth's callback.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const rawToken = searchParams.get("token");
    const email = searchParams.get("email");
    const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

    // Use NEXTAUTH_URL for redirects (request.url resolves to internal host on Cloud Run)
    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://datasciencegt.org";

    if (!rawToken || !email) {
        return NextResponse.redirect(`${baseUrl}/auth/error?error=Configuration`);
    }

    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

    try {
        // Hash the token the same way @auth/core does (Web Crypto SHA-256)
        const data = new TextEncoder().encode(`${rawToken}${secret}`);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashedToken = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        if (!db) {
            return NextResponse.redirect(`${baseUrl}/auth/error?error=Configuration`);
        }

        // Look up and delete the token (one-time use)
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
            return NextResponse.redirect(`${baseUrl}/auth/error?error=Verification`);
        }

        const invite = result[0];

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
    } catch (error) {
        console.error("[verify-email] Error:", error);
        return NextResponse.redirect(`${baseUrl}/auth/error?error=Verification`);
    }
}
