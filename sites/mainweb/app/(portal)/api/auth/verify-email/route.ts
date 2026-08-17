import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  db,
  users,
  sessions,
  accounts,
  stripePayments,
  userAccountLinks,
  verificationTokens,
} from "@query/db";
import {
  createOrUpdateMembership,
  paidForBootcamp,
  isBootcampAddOnOnly,
  planFromMetadata,
} from "@query/db/services/membership";
import { eq, and, isNull } from "drizzle-orm";
import { rateLimit, cache, resolveClientIp } from "@query/api";
import type { DrizzleDB } from "@query/db";

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
        { status: 400 },
      );
    }

    /**
     * Auth.js stores the identifier lowercased, so the lookup has to match
     * that or sign-in fails forever for anyone who typed a capital letter.
     */
    const identifier = email.normalize("NFKC").toLowerCase().trim();

    /**
     * Throttle the identity being attacked, not the connection.
     *
     * The code is six digits and grants a 30-day session, so the only thing
     * standing between a guesser and someone else's account is this limit.
     * Keying it on X-Forwarded-For made it decorative: that header is set by
     * the caller, and a fresh value per request mints a fresh bucket every
     * time. The IP is still mixed in to slow a single host down, but the
     * per-email bucket is what actually bounds the guess rate.
     */
    const ip = resolveClientIp(request.headers.get("x-forwarded-for"));
    const perEmail = rateLimit(`verify-email:${identifier}`, 5, 0.05);
    const perIp = rateLimit(`verify-ip:${ip}`, 20, 0.2);

    if (!perEmail.allowed || !perIp.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }

    if (!db) {
      console.error("[verify-email] Database connection not available");
      return NextResponse.json(
        { success: false, error: "Server configuration error." },
        { status: 500 },
      );
    }

    const customTokenValue = `custom:${code}`;
    const safeEmail = email.replace(/[\n\r]/g, "");

    const result = await db.transaction(async (tx) => {
      // Consume the token (DELETE + RETURNING)
      const [invite] = await tx
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, customTokenValue),
          ),
        )
        .returning();

      if (!invite) {
        console.warn(`[verify-email] No matching code for ${safeEmail}`);
        return null;
      }

      // Check expiry
      if (new Date(invite.expires) < new Date()) {
        console.warn(`[verify-email] Code expired for ${safeEmail}`);
        return { error: "Code has expired. Please request a new one." };
      }

      // Find or create user
      let user = await tx
        .select()
        .from(users)
        .where(eq(users.email, identifier))
        .then((r) => r[0] ?? null);

      if (!user) {
        const newId = crypto.randomUUID();
        const inserted = await tx
          .insert(users)
          .values({ id: newId, email: identifier, emailVerified: new Date() })
          .returning();
        const firstUser = inserted[0];
        if (!firstUser) {
          throw new Error("Failed to create user");
        }
        user = firstUser;
      } else if (!user.emailVerified) {
        await tx
          .update(users)
          .set({ emailVerified: new Date() })
          .where(eq(users.id, user.id));
      }

      // Create a database session
      const sessionToken = crypto.randomUUID();
      const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await tx.insert(sessions).values({
        sessionToken,
        userId: user.id,
        expires: sessionExpires,
      });

      // --- Auto-link: Create account record for email provider if missing ---
      const existingAccount = await tx
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, user.id),
            eq(accounts.provider, "nodemailer"),
          ),
        )
        .then((res) => res[0]);

      if (!existingAccount) {
        await tx.insert(accounts).values({
          userId: user.id,
          type: "email",
          provider: "nodemailer",
          providerAccountId: identifier,
        });
      }

      // --- Auto-link: Link Stripe payment if matching email exists ---
      try {
        const payment = await tx.query.stripePayments.findFirst({
          where: and(
            eq(stripePayments.customerEmail, identifier),
            isNull(stripePayments.linkedUserId),
            eq(stripePayments.paymentStatus, "paid"),
          ),
        });

        if (payment) {
          // Check no existing link for this user
          const existingLink = await tx.query.userAccountLinks.findFirst({
            where: eq(userAccountLinks.userId, user.id),
          });

          if (!existingLink) {
            const names = (user.name || "Member").split(" ");
            const firstName = names[0] || "Member";
            const lastName = names.slice(1).join(" ") || "Member";

            await tx.insert(userAccountLinks).values({
              userId: user.id,
              stripePaymentId: payment.id,
              providedFirstName: firstName,
              providedLastName: lastName,
              providedEmail: identifier,
            });

            await tx
              .update(stripePayments)
              .set({
                linkedUserId: user.id,
                linkedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(stripePayments.id, payment.id));

            // One shared implementation rather than a fourth copy: this one
            // used to restart the term from today on renewal (discarding
            // remaining months), write no membership_history row, and refuse
            // outright when no hackathon edition was open.
            await createOrUpdateMembership(tx as unknown as DrizzleDB, {
              userId: user.id,
              firstName,
              lastName,
              bootcampMember: paidForBootcamp(payment.metadata),
              addOnOnly: isBootcampAddOnOnly(payment.metadata),
              plan: planFromMetadata(payment.metadata),
            });
          }
        }
      } catch (linkError) {
        console.error("[verify-email] Auto-link error:", linkError);
        // Don't fail the login if auto-link fails, just log it
      }

      return {
        sessionToken,
        sessionExpires,
        userId: user.id,
      };
    });

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired code. Please try again." },
        { status: 401 },
      );
    }

    if ("error" in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 },
      );
    }

    try {
      cache.delete(`member:${result.userId}`);
      cache.delete(`member:status:${result.userId}`);
    } catch (e) {
      console.warn("[verify-email] Failed to invalidate cache", e);
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

    response.cookies.set(cookieName, result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      expires: result.sessionExpires,
    });

    return response;
  } catch (error: unknown) {
    console.error("[verify-email] Error:", error);
    return NextResponse.json(
      { success: false, error: "Server error. Please try again." },
      { status: 500 },
    );
  }
}
