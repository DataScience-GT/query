import type { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/nodemailer";
import { db } from "@query/db";
import { sql } from "drizzle-orm";

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
          `<td style="padding: 0 4px;"><div style="width: 44px; height: 56px; background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; font-size: 28px; font-weight: 700; color: ${mainColor}; line-height: 56px; text-align: center; font-family: 'Courier New', monospace;">${d}</div></td>`
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
        &copy; ${new Date().getFullYear()} Data Science at Georgia Tech
      </td>
    </tr>
  </table>
</body>
`;
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      allowDangerousEmailAccountLinking: true,
      checks: [],
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
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
      from: process.env.EMAIL_FROM || "noreply@datasciencegt.org",
      // 6-digit code flow — no magic link, user types the code.
      sendVerificationRequest: async ({ identifier, provider }) => {
        // Generate a 6-digit numeric code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const customToken = `custom:${code}`;
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store code in DB
        if (db) {
          const expiresISO = expires.toISOString();
          await db.execute(sql`
            INSERT INTO "verificationToken" ("identifier", "token", "expires")
            VALUES (${identifier}, ${customToken}, ${expiresISO}::timestamp)
          `);
        }

        const { createTransport } = await import("nodemailer");
        const transport = createTransport(provider.server);

        const baseUrl =
          process.env.NEXTAUTH_URL ||
          process.env.AUTH_URL ||
          "https://datasciencegt.org";
        const host = new URL(baseUrl).host;

        try {
          const result = await transport.sendMail({
            to: identifier,
            from: provider.from,
            subject: `${code} — Your sign-in code for ${host}`,
            text: `Your sign-in code is: ${code}\n\nEnter this code on ${host} to sign in. It expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n`,
            html: html({ code, host }),
          });

          const failed = result.rejected.concat(result.pending).filter(Boolean);
          if (failed.length) {
            throw new Error(`Email(s) could not be sent`);
          }
        } catch (error) {
          throw new Error("Failed to send verification email. Please try again later.");
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
    async session({ session, user }) {
      if (user && session.user && db) {
        session.user.id = user.id;

        // Add judge status to session for easier client-side checks
        const judge = await db.query.judges.findFirst({
          where: (j, { eq }) => eq(j.userId, user.id)
        });
        // @ts-expect-error - custom property
        session.user.isJudge = !!judge;
      }
      return session;
    },
    async redirect({ _url: url, baseUrl }) {
      return url.startsWith("/") ? `${baseUrl}${url}` : (new URL(url).origin === baseUrl ? url : baseUrl);
    },
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  debug: process.env.NODE_ENV === "development",
};