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
    return DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    });
  } catch (error) {
    console.error("Auth adapter: Failed to create Drizzle adapter:", error);
    return undefined;
  }
}

export const adapter: Adapter | undefined = createAdapter();