import { NextRequest, NextResponse } from "next/server";
import { db, users, sessions } from "@query/db";
import { eq, sql } from "drizzle-orm";

/**
 * Code-based email verification endpoint.
 *
 * Accepts POST { code, email } — looks up `custom:<code>` in the
 * verificationToken table, consumes it, creates a session, and
 * returns the session cookie + redirect URL.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { code, email } = body as { code?: string; email?: string };

        if (!code || !email) {
            return NextResponse.json(
                { success: false, error: "Missing code or email." },
                { status: 400 }
            );
        }

        if (!db) {
            console.error("[verify-email] Database connection not available");
            return NextResponse.json(
                { success: false, error: "Server configuration error." },
                { status: 500 }
            );
        }

        const customTokenValue = `custom:${code}`;
        console.log(`[verify-email] Verifying code for ${email}`);

        // Consume the token (DELETE + RETURNING)
        const result = await db.execute(sql`
            DELETE FROM "verificationToken"
            WHERE "identifier" = ${email} AND "token" = ${customTokenValue}
            RETURNING *
        `);

        if (result.rowCount === 0) {
            console.warn(`[verify-email] No matching code for ${email}`);
            return NextResponse.json(
                { success: false, error: "Invalid or expired code. Please try again." },
                { status: 401 }
            );
        }

        const invite = result.rows[0] as any;
        console.log(`[verify-email] Code verified for ${email}`);

        // Check expiry
        if (new Date(invite.expires) < new Date()) {
            console.warn(`[verify-email] Code expired for ${email}`);
            return NextResponse.json(
                { success: false, error: "Code has expired. Please request a new one." },
                { status: 401 }
            );
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
            console.log(`[verify-email] Created new user ${user.id}`);
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

        // Build JSON response with Set-Cookie header
        const baseUrl =
            process.env.NEXTAUTH_URL ||
            process.env.AUTH_URL ||
            "https://datasciencegt.org";
        const isSecure = baseUrl.startsWith("https");
        const cookieName = isSecure
            ? "__Secure-authjs.session-token"
            : "authjs.session-token";

        const response = NextResponse.json({
            success: true,
            redirectUrl: "/dashboard",
        });

        response.cookies.set(cookieName, sessionToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: isSecure,
            path: "/",
            expires: sessionExpires,
        });

        console.log(`[verify-email] Session created for ${email}`);
        return response;
    } catch (error: any) {
        console.error("[verify-email] Error:", error);
        return NextResponse.json(
            { success: false, error: "Server error. Please try again." },
            { status: 500 }
        );
    }
}
