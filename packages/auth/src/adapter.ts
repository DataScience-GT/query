import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, users, accounts, sessions, verificationTokens } from "@query/db";
import type { Adapter } from "next-auth/adapters";

// Only create adapter if database is available and properly initialized
function createAdapter(): Adapter | undefined {
  // Check both that db exists and that DATABASE_URL was set
  if (!db || !process.env.DATABASE_URL) {
    console.warn("Auth adapter: No database connection, using JWT sessions");
    return undefined;
  }

  try {
    const baseAdapter = DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    });

    // Override token methods — our custom sendVerificationRequest (config.ts)
    // stores its own token with a "custom:" prefix, and our custom
    // /api/auth/verify-email route consumes it directly.
    // NextAuth's default flow creates a *hashed* token that our custom
    // verify route can never match, causing Verification_Failed errors.
    return {
      ...baseAdapter,
      createVerificationToken: async (token) => {
        // No-op: our sendVerificationRequest handles token creation
        return token;
      },
      useVerificationToken: async (params) => {
        // No-op: our /api/auth/verify-email route handles token consumption
        return null;
      },
    };
  } catch (error) {
    console.error("Auth adapter: Failed to create Drizzle adapter:", error);
    return undefined;
  }
}

export const adapter: Adapter | undefined = createAdapter();