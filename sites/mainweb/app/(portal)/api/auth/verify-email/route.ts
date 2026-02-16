import { NextRequest, NextResponse } from "next/server";
import { db, users, sessions, accounts, stripePayments, userAccountLinks, members } from "@query/db";
import { eq, and, isNull, sql } from "drizzle-orm";

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

        // --- Auto-link: Create account record for email provider if missing ---
        const existingAccount = await db
            .select()
            .from(accounts)
            .where(and(eq(accounts.userId, user.id), eq(accounts.provider, "nodemailer")))
            .then((res) => res[0]);

        if (!existingAccount) {
            await db.insert(accounts).values({
                userId: user.id,
                type: "email",
                provider: "nodemailer",
                providerAccountId: email,
            });
            console.log(`[verify-email] Created account record for ${email}`);
        }

        // --- Auto-link: Link Stripe payment if matching email exists ---
        try {
            const payment = await db.query.stripePayments.findFirst({
                where: and(
                    eq(stripePayments.customerEmail, email),
                    isNull(stripePayments.linkedUserId),
                    eq(stripePayments.paymentStatus, "paid")
                ),
            });

            if (payment) {
                // Check no existing link for this user
                const existingLink = await db.query.userAccountLinks.findFirst({
                    where: eq(userAccountLinks.userId, user.id),
                });

                if (!existingLink) {
                    const names = (user.name || "Member").split(" ");
                    const firstName = names[0] || "Member";
                    const lastName = names.slice(1).join(" ") || "Member";

                    await db.insert(userAccountLinks).values({
                        userId: user.id,
                        stripePaymentId: payment.id,
                        providedFirstName: firstName,
                        providedLastName: lastName,
                        providedEmail: email,
                    });

                    await db
                        .update(stripePayments)
                        .set({
                            linkedUserId: user.id,
                            linkedAt: new Date(),
                            updatedAt: new Date(),
                        })
                        .where(eq(stripePayments.id, payment.id));

                    // Create/Update membership
                    const now = new Date();
                    const oneYearFromNow = new Date(now);
                    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

                    const existingMember = await db.query.members.findFirst({
                        where: eq(members.userId, user.id),
                    });

                    if (existingMember) {
                        await db
                            .update(members)
                            .set({
                                isActive: true,
                                membershipStartDate: now,
                                membershipEndDate: oneYearFromNow,
                                renewalCount: existingMember.renewalCount + 1,
                                memberType: "continuous",
                                updatedAt: now,
                            })
                            .where(eq(members.id, existingMember.id));
                    } else {
                        await db.insert(members).values({
                            userId: user.id,
                            firstName,
                            lastName,
                            memberType: "new",
                            isActive: true,
                            membershipStartDate: now,
                            membershipEndDate: oneYearFromNow,
                            renewalCount: 0,
                        });
                    }

                    console.log(`[verify-email] Auto-linked Stripe payment ${payment.id} for ${email}`);
                }
            }
        } catch (linkError) {
            console.error("[verify-email] Auto-link error:", linkError);
            // Don't fail the login if auto-link fails, just log it
        }

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
