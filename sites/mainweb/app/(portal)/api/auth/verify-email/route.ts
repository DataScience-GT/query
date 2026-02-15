import { NextRequest, NextResponse } from "next/server";
import { db, verificationTokens, users, sessions } from "@query/db";
import { eq, and } from "drizzle-orm";

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
            return NextResponse.redirect(`${baseUrl}/auth/error?error=Configuration`);
        }

        // Look up the token directly — our sendVerificationRequest stores
        // the token value as-is (no hashing) with a "custom:" prefix
        const customTokenValue = `custom:${tokenParam}`;

        console.log(`[verify-email] Looking up token for ${email}`);

        const result = await db
            .delete(verificationTokens)
            .where(
                and(
                    eq(verificationTokens.identifier, email),
                    eq(verificationTokens.token, customTokenValue)
                )
            )
            .returning();

        if (result.length === 0) {
            console.warn(`[verify-email] No matching token found for ${email} — link may be expired or already used`);
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
