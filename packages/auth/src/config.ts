import type { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

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
  ],
  pages: {
    signIn: "/",
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
      // Handle callback URLs - allow /dashboard, /judge, etc.
      if (url.includes('/dashboard') || url.includes('/judge') || url.includes('/admin') || url.includes('/club')) {
        // Extract the path and append to baseUrl
        const path = new URL(url, baseUrl).pathname;
        return `${baseUrl}${path}`;
      }
      // Default to dashboard after sign-in
      return `${baseUrl}/dashboard`;
    },
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  debug: process.env.NODE_ENV === "development",
};