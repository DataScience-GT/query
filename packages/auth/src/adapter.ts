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

    // DEBUG: Wrap token methods with logging
    const wrappedAdapter: Adapter = {
      ...baseAdapter,
      async createVerificationToken(data) {
        console.log("[AUTH-DEBUG] createVerificationToken called:", {
          identifier: data.identifier,
          tokenHash: data.token?.substring(0, 20) + "...",
          expires: data.expires,
        });
        const result = await baseAdapter.createVerificationToken!(data);
        console.log("[AUTH-DEBUG] createVerificationToken result:", result ? "SUCCESS" : "NULL");
        return result;
      },
      async useVerificationToken(params) {
        console.log("[AUTH-DEBUG] useVerificationToken called:", {
          identifier: params.identifier,
          tokenHash: params.token?.substring(0, 20) + "...",
        });
        const result = await baseAdapter.useVerificationToken!(params);
        console.log("[AUTH-DEBUG] useVerificationToken result:", result ? "FOUND" : "NOT_FOUND (THIS CAUSES VERIFICATION_FAILED)");
        if (!result) {
          // Extra debug: check if any tokens exist for this identifier
          const { eq } = await import("drizzle-orm");
          const existing = await db.select().from(verificationTokens).where(eq(verificationTokens.identifier, params.identifier));
          console.log("[AUTH-DEBUG] tokens for this identifier:", existing.length);
          if (existing.length > 0) {
            console.log("[AUTH-DEBUG] stored token starts with:", existing[0].token?.substring(0, 20));
            console.log("[AUTH-DEBUG] lookup token starts with:", params.token?.substring(0, 20));
            console.log("[AUTH-DEBUG] tokens match:", existing[0].token === params.token);
          }
        }
        return result;
      },
    };

    return wrappedAdapter;
  } catch (error) {
    console.error("Auth adapter: Failed to create Drizzle adapter:", error);
    return undefined;
  }
}

export const adapter: Adapter | undefined = createAdapter();