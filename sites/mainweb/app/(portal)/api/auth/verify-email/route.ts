import { NextResponse } from "next/server";
import { siteOrigin } from "@query/core/server";
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
import { eq, and, isNull, like, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { isLockedOut, recordFailure } from "@query/db/services/auth-throttle";
import { rateLimit, cache, resolveClientIp } from "@query/api";
import type { DrizzleDB } from "@query/db";

/**
 * Code-based email verification endpoint.
 *
 * Accepts POST { code, email } — looks up `custom:<code>` in the
 * verificationToken table, consumes it, creates a session, and
 * returns the session cookie + redirect URL.
 */

/**
 * Wrong guesses a code survives. Six digits against five guesses is 1 in
 * 200,000 per code; the in-memory limiter alone is per instance, so with ten
 * instances it allowed ten times the guesses it was sized for.
 */
const MAX_CODE_ATTEMPTS = 5;

/** First character kept, the rest of the local part starred: a***@domain. */
function maskEmail(email: string) {
  const [local = "", domain = ""] = email.replace(/[\n\r]/g, "").split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

const TOO_MANY = {
  success: false,
  error: "Too many attempts. Please try again later.",
} as const;

/**
 * Cross-site login CSRF: a page on another origin could otherwise POST an
 * attacker's own code and sign a victim's browser into the attacker's account.
 * Requires a JSON body (not sendable by a plain cross-site form) and a
 * same-origin Origin, or Sec-Fetch-Site: same-origin where Origin is absent.
 */
function isSameOriginJson(request: NextRequest) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  if (origin) return origin === siteOrigin();
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginJson(request)) {
      return NextResponse.json(
        { success: false, error: "Forbidden." },
        { status: 403 },
      );
    }
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
      return NextResponse.json(TOO_MANY, { status: 429 });
    }

    if (!db) {
      console.error("[verify-email] Database connection not available");
      return NextResponse.json(
        { success: false, error: "Something went wrong. Please try again later." },
        { status: 500 },
      );
    }

    const customTokenValue = `custom:${code}`;
    const safeEmail = maskEmail(email);

    const result = await db.transaction(async (tx) => {
      // Daily failure cap per address, shared by every instance and carried
      // across reissued codes.
      if (await isLockedOut(tx, identifier)) return { tooMany: true as const };

      // Lock the live code's row first: concurrent guesses queue behind it and
      // each sees the attempts the one before left, so the cap of
      // MAX_CODE_ATTEMPTS holds however the requests race.
      const liveCode = and(
        eq(verificationTokens.identifier, identifier),
        like(verificationTokens.token, "custom:%"),
      );
      const [live] = await tx
        .select()
        .from(verificationTokens)
        .where(liveCode)
        .orderBy(sql`${verificationTokens.expires} desc`)
        .limit(1)
        .for("update");

      // Failures return (not throw) so the charge commits.
      if (!live) {
        console.warn(`[verify-email] No live code for ${safeEmail}`);
        await recordFailure(tx, identifier);
        return null;
      }

      const ownRow = and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, live.token),
      );
      if (live.attempts >= MAX_CODE_ATTEMPTS) {
        await tx.delete(verificationTokens).where(ownRow);
        await recordFailure(tx, identifier);
        return null;
      }

      const stored = Buffer.from(live.token);
      const submitted = Buffer.from(customTokenValue);
      const matches =
        stored.length === submitted.length && timingSafeEqual(stored, submitted);
      if (!matches) {
        console.warn(`[verify-email] Wrong code for ${safeEmail}`);
        if (live.attempts + 1 >= MAX_CODE_ATTEMPTS) {
          await tx.delete(verificationTokens).where(ownRow);
        } else {
          await tx
            .update(verificationTokens)
            .set({ attempts: sql`${verificationTokens.attempts} + 1` })
            .where(ownRow);
        }
        await recordFailure(tx, identifier);
        return null;
      }

      // Consume the code.
      await tx.delete(verificationTokens).where(ownRow);
      const invite = live;

      // Check expiry
      if (new Date(invite.expires) < new Date()) {
        console.warn(`[verify-email] Code expired for ${safeEmail}`);
        return { error: "Code has expired. Please request a new one." };
      }

      // Find or create user. Case-insensitive: OAuth sign-ups keep the case
      // the provider sent ("John.Doe@gatech.edu"), and an exact match against
      // this lowercased address missed them and created a second account.
      let user = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${identifier}`)
        .orderBy(sql`${users.emailVerified} asc nulls last`)
        .limit(1)
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
      // In a savepoint: a failed query aborts the whole Postgres transaction, so
      // catching it without one turned the COMMIT below into a silent ROLLBACK —
      // the session was never stored and the user bounced back to /login.
      try {
        await tx.transaction(async (link) => {
          const payment = await link.query.stripePayments.findFirst({
            where: {
              customerEmail: identifier,
              linkedUserId: { isNull: true },
              paymentStatus: "paid",
            },
          });
          if (!payment) return;

          // Check no existing link for this user
          const existingLink = await link.query.userAccountLinks.findFirst({
            where: { userId: user.id },
          });
          if (existingLink) return;

          // The link is the claim: a payment somebody else linked in the
          // meantime must not grant a second membership.
          const claimed = await link
            .update(stripePayments)
            .set({
              linkedUserId: user.id,
              linkedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(stripePayments.id, payment.id),
                isNull(stripePayments.linkedUserId),
              ),
            );
          if (claimed.rowCount === 0) return;

          const names = (user.name || "Member").split(" ");
          const firstName = names[0] || "Member";
          const lastName = names.slice(1).join(" ") || "Member";

          await link.insert(userAccountLinks).values({
            userId: user.id,
            stripePaymentId: payment.id,
            providedFirstName: firstName,
            providedLastName: lastName,
            providedEmail: identifier,
          });

          // One shared implementation rather than a fourth copy: this one
          // used to restart the term from today on renewal (discarding
          // remaining months), write no membership_history row, and refuse
          // outright when no hackathon edition was open.
          await createOrUpdateMembership(link as unknown as DrizzleDB, {
            userId: user.id,
            firstName,
            lastName,
            bootcampMember: paidForBootcamp(payment.metadata),
            addOnOnly: isBootcampAddOnOnly(payment.metadata),
            plan: planFromMetadata(payment.metadata),
          });
        });
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

    if ("tooMany" in result) {
      return NextResponse.json(TOO_MANY, { status: 429 });
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
    const baseUrl = siteOrigin();
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
