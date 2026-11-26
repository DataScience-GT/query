import type { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/nodemailer";
import { db } from "@query/db";
import { NOREPLY_EMAIL, ORG_NAME_SPOKEN } from "@query/core";
import { siteOrigin } from "@query/core/server";
import { linkPaidPaymentByVerifiedEmail } from "@query/db/services/membership";
import {
  CODES_PER_IDENTIFIER_PER_HOUR,
  GLOBAL_CODES_PER_HOUR,
  GLOBAL_THROTTLE_KEY,
  clearFailures,
  isLockedOut,
  requesterCodeCaps,
  takeCodeSlot,
} from "@query/db/services/auth-throttle";
import { sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { discordProviders, hasVerifiedDiscordEmail } from "./discord";
import { currentClientIp, markCodesBusy } from "./sign-in-attempt";

function html(params: { code: string; host: string }) {
  const { code, host } = params;

  const mainColor = "#10b981";
  const backgroundColor = "#0f172a";
  const textColor = "#f8fafc";

  return `
<body style="background: ${backgroundColor}; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; margin: 0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${backgroundColor}; max-width: 600px; margin: auto; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);">
    <!-- Header with Gradient Border -->
    <tr>
      <td style="background: linear-gradient(90deg, #10b981 0%, #0ea5e9 100%); height: 4px;"></td>
    </tr>

    <!-- Content Area -->
    <tr>
      <td style="padding: 40px 20px; text-align: center; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255,255,255,0.05);">

        <div style="margin-bottom: 24px;">
           <h1 style="color: ${textColor}; font-size: 24px; font-weight: 300; letter-spacing: 1px; margin: 0;">DataScience<span style="font-weight: 600; color: ${mainColor};">GT</span></h1>
        </div>

        <h2 style="color: ${textColor}; font-size: 20px; font-weight: 400; margin-bottom: 16px;">Your Verification Code</h2>

        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Enter this code on <strong>${host}</strong> to sign in. It expires in 10 minutes.
        </p>

        <!-- Code Display -->
        <div style="margin: 32px auto; max-width: 320px;">
          <table border="0" cellspacing="0" cellpadding="0" style="margin: auto;">
            <tr>
              ${code
                .split("")
                .map(
                  (d) =>
                    `<td style="padding: 0 4px;"><div style="width: 44px; height: 56px; background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; font-size: 28px; font-weight: 700; color: ${mainColor}; line-height: 56px; text-align: center; font-family: 'Courier New', monospace;">${d}</div></td>`,
                )
                .join("")}
            </tr>
          </table>
        </div>

        <p style="color: #64748b; font-size: 12px; margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">
          If you didn't request this email, you can safely ignore it.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="text-align: center; padding: 20px; background: #020617; color: #475569; font-size: 11px;">
        &copy; ${new Date().getFullYear()} ${ORG_NAME_SPOKEN}
      </td>
    </tr>
  </table>
</body>
`;
}

class CodeCapReached extends Error {}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      allowDangerousEmailAccountLinking: true,
      // PKCE + state are the CSRF protection on the OAuth callback. Disabled
      // (`checks: []`) they combined with allowDangerousEmailAccountLinking to let
      // a forged callback attach an attacker's identity to an existing account. If
      // sign-in fails with "State cookie was missing", the cause is cookie/host
      // config (AUTH_URL must match the public origin), not this array.
      checks: ["pkce", "state"],
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    // Discord is optional: only registered when both client variables are set,
    // so deployments without them keep working. Signing in grants no Discord
    // roles; see discord.ts.
    ...discordProviders(),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST as string,
        port: Number(process.env.EMAIL_SERVER_PORT || "587"),
        auth: {
          user: process.env.EMAIL_SERVER_USER as string,
          pass: process.env.EMAIL_SERVER_PASSWORD as string,
        },
        pool: true,
      },
      from: process.env.EMAIL_FROM || NOREPLY_EMAIL,
      // 6-digit code flow — no magic link, user types the code.
      sendVerificationRequest: async ({ identifier, provider }) => {
        // This 6-digit code is the sole factor for email sign-in, so it must come
        // from a CSPRNG — Math.random() is predictable from observed outputs.
        const code = randomInt(100000, 1000000).toString();
        const customToken = `custom:${code}`;
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Outstanding codes for this identifier are dropped first: leaving them live
        // lets anyone spam sign-in requests to stack up valid codes, and every extra
        // one multiplies the odds of a blind guess against a 6-digit secret.
        if (db) {
          // One code email per address per minute, whatever instance takes the
          // request: the live code's expiry says when it was issued. A repeat
          // inside that minute sends nothing and keeps the code already in the
          // inbox, so hammering sign-in cannot flood somebody's mail or burn
          // the shared sending quota one address at a time.
          const issuedWithinMinute = new Date(
            Date.now() + 9 * 60 * 1000,
          ).toISOString();
          const expiresISO = expires.toISOString();
          // Check, drop and insert as one step per address: the advisory lock
          // serialises concurrent requests for the same identifier across
          // instances, so parallel sign-ins cannot all see "no recent code"
          // and each send one.
          const issued = await db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`,
            );
            const recent = await tx.execute<Record<string, unknown>>(sql`
              SELECT 1 FROM "verificationToken"
              WHERE "identifier" = ${identifier} AND "token" LIKE 'custom:%'
                AND "expires" > ${issuedWithinMinute}::timestamptz
              LIMIT 1
            `);
            if (recent.rows.length > 0) return false;

            // Database-backed caps (see auth-throttle). Beyond any of them
            // nothing is sent, and the sign-in route is told, so the page says
            // codes are busy instead of reporting one sent. Failed guesses carry
            // across reissued codes, so a locked-out address gets no new code
            // either. Whoever is asking goes first (their network, the
            // address's domain), then the address, then the deployment: one
            // client reaches its own limit before it can spend what everyone
            // else needs. A refused cap throws so the transaction rolls back
            // any slot already taken: otherwise a request past one cap would
            // still spend the others, and posted repeatedly would shut sign-in
            // off for everyone.
            if (await isLockedOut(tx, identifier)) throw new CodeCapReached();
            for (const cap of requesterCodeCaps(identifier, currentClientIp())) {
              if (!(await takeCodeSlot(tx, cap.key, cap.max)))
                throw new CodeCapReached();
            }
            if (
              !(await takeCodeSlot(tx, identifier, CODES_PER_IDENTIFIER_PER_HOUR))
            )
              throw new CodeCapReached();
            if (!(await takeCodeSlot(tx, GLOBAL_THROTTLE_KEY, GLOBAL_CODES_PER_HOUR)))
              throw new CodeCapReached();

            await tx.execute(sql`
              DELETE FROM "verificationToken"
              WHERE "identifier" = ${identifier} AND "token" LIKE 'custom:%'
            `);
            await tx.execute(sql`
              INSERT INTO "verificationToken" ("identifier", "token", "expires")
              VALUES (${identifier}, ${customToken}, ${expiresISO}::timestamptz)
            `);
            return true;
          }).catch((error: unknown) => {
            if (error instanceof CodeCapReached) {
              markCodesBusy();
              return false;
            }
            throw error;
          });
          if (!issued) return;
        }

        const { createTransport } = await import("nodemailer");
        const transport = createTransport(provider.server);

        const baseUrl = siteOrigin();
        const host = new URL(baseUrl).host;

        try {
          const result = await transport.sendMail({
            to: identifier,
            from: provider.from,
            subject: `${code} — Your sign-in code for ${host}`,
            text: `Your sign-in code is: ${code}\n\nEnter this code on ${host} to sign in. It expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n`,
            html: html({ code, host }),
          });

          const failed = result.rejected
            .concat(result.pending ?? [])
            .filter(Boolean);
          if (failed.length) {
            throw new Error(`Email(s) could not be sent`);
          }
        } catch {
          // The row above now looks freshly issued; left in place it would make
          // the retry inside the next minute send nothing and report success.
          if (db) {
            await db
              .execute(
                sql`
                  DELETE FROM "verificationToken"
                  WHERE "identifier" = ${identifier} AND "token" = ${customToken}
                `,
              )
              .catch(() => undefined);
          }
          throw new Error(
            "Failed to send verification email. Please try again later.",
          );
        }
      },
    }),
  ],
  basePath: "/api/auth",
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    // allowDangerousEmailAccountLinking trusts the address to be the user's own.
    // Auth.js's Google provider never checks email_verified, so an unverified
    // Google address could be linked into the member who owns it. Discord's
    // profile has the same hole, so it must say `verified: true` and carry an
    // email; anything else is refused before an account is created or linked.
    async signIn({ account, profile }) {
      if (account?.provider === "google" && profile?.email_verified === false) {
        return false;
      }
      if (account?.provider === "discord" && !hasVerifiedDiscordEmail(profile)) {
        return false;
      }
      return true;
    },
    // No database work beyond what the adapter already did. With the database
    // session strategy this runs on every request, so anything queried here is
    // queried once per request per user — a judge lookup used to live here and
    // cost a second connection checkout across the whole fleet. Judge status
    // comes from user.getPortalContext (cached) and judge.isJudge.
    async session({ session, user }) {
      if (user && session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      return url.startsWith("/")
        ? `${baseUrl}${url}`
        : new URL(url).origin === baseUrl
          ? url
          : baseUrl;
    },
  },
  events: {
    // Claim a paid-but-unlinked payment on every sign-in. Linking used to happen
    // only inside the membership page via a mutation the client fired on mount,
    // so anyone who paid and never opened that page stayed unlinked forever.
    // Sign-in is the one place every member passes through and the address here
    // is provider-verified. Failures are swallowed: a membership that cannot be
    // granted must never block the sign-in.
    async signIn({ user }) {
      if (!db || !user?.id || !user.email) return;
      // Someone who got in this way owns the address, so guesses at its code
      // by anyone else stop counting against them. Same spelling the code
      // route keys its rows on.
      try {
        await clearFailures(db, user.email.normalize("NFKC").toLowerCase().trim());
      } catch {
        // Nothing here may break sign-in either.
      }
      try {
        await linkPaidPaymentByVerifiedEmail(db, {
          userId: user.id,
          email: user.email,
          name: user.name,
        });
      } catch {
        // Swallowed deliberately — see above. Nothing here may break sign-in.
      }
    },
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  debug: process.env.NODE_ENV === "development",
};
