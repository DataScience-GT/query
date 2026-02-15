import type { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/nodemailer";

function html(params: { url: string; host: string }) {
  const { url, host } = params;

  // Liquid Glass Design with Teal/Emerald Gradient
  const mainColor = "#10b981"; // Emerald-500
  const backgroundColor = "#0f172a"; // Slate-900
  const textColor = "#f8fafc"; // Slate-50

  return `
<body style="background: ${backgroundColor}; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; margin: 0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${backgroundColor}; max-width: 600px; margin: auto; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);">
    <!-- Header with Gradient Border -->
    <tr>
      <td style="background: linear-gradient(90deg, #10b981 0%, #0ea5e9 100%); height: 4px;"></td>
    </tr>

    <!-- Content Area with Glass Effect -->
    <tr>
      <td style="padding: 40px 20px; text-align: center; background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.05);">

        <!-- Logo / Icon -->
        <div style="margin-bottom: 24px;">
           <h1 style="color: ${textColor}; font-size: 24px; font-weight: 300; letter-spacing: 1px; margin: 0;">DataScience<span style="font-weight: 600; color: ${mainColor};">GT</span></h1>
        </div>

        <h2 style="color: ${textColor}; font-size: 20px; font-weight: 400; margin-bottom: 16px;">Secure Sign In</h2>

        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          Click the button below to authenticate your access to <strong>${host}</strong>. This link expires in 24 hours.
        </p>

        <!-- Primary Button -->
        <table border="0" cellspacing="0" cellpadding="0" style="margin: auto;">
          <tr>
            <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, ${mainColor} 0%, #059669 100%); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
              <a href="${url}" target="_blank" style="font-size: 16px; font-family: sans-serif; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); display: inline-block; font-weight: 600;">
                Sign In Now
              </a>
            </td>
          </tr>
        </table>

        <!-- Security Note -->
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
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Allows Google login to "claim" the pre-seeded user record via email match
      allowDangerousEmailAccountLinking: true,
      // Disable all checks for Firebase proxy (cookies don't transfer)
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
        host: process.env.EMAIL_SERVER_HOST!,
        port: Number(process.env.EMAIL_SERVER_PORT || "587"),
        auth: {
          user: process.env.EMAIL_SERVER_USER!,
          pass: process.env.EMAIL_SERVER_PASSWORD!,
        },
        pool: true,
      },
      from: process.env.EMAIL_FROM || "noreply@datasciencegt.org",
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        // @ts-ignore
        const { createTransport } = await import("nodemailer");
        const transport = createTransport(provider.server);

        const parsedUrl = new URL(url);
        const host = parsedUrl.host;
        const callbackUrl = parsedUrl.searchParams.get("callbackUrl") || "/dashboard";

        // Generate our own random token and store it directly in the DB.
        // This bypasses NextAuth's internal token hashing which causes
        // Verification_Failed errors in our deployment environment.
        const { randomBytes } = await import("crypto");
        const customToken = randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Dynamically import DB to store our custom token
        const { db, verificationTokens } = await import("@query/db");
        if (db) {
          await db.insert(verificationTokens).values({
            identifier,
            token: `custom:${customToken}`,
            expires,
          });
        }

        // Build /verify URL with our custom token
        const verifyUrl = new URL("/verify", parsedUrl.origin);
        verifyUrl.searchParams.set("token", customToken);
        verifyUrl.searchParams.set("email", identifier);
        verifyUrl.searchParams.set("callbackUrl", callbackUrl);
        const safeUrl = verifyUrl.toString();

        const result = await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Sign in to ${host}`,
          text: `Sign in to ${host}\n${safeUrl}\n\n`,
          html: html({ url: safeUrl, host }),
        });

        const failed = result.rejected.concat(result.pending).filter(Boolean);
        if (failed.length) {
          throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
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
      if (user && session.user) {
        // Ensures the ID generated during seeding is the ID used in the session
        session.user.id = user.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Handle callback URLs
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      } else if (new URL(url).origin === baseUrl) {
        return url;
      }
      return baseUrl;
    },
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  debug: process.env.NODE_ENV === "development",
};