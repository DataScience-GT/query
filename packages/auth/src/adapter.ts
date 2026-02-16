import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, users, accounts, sessions, verificationTokens } from "@query/db";
import { sql } from "drizzle-orm";
import type { Adapter, VerificationToken } from "next-auth/adapters";

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

    // Override token methods with raw SQL to avoid Drizzle "boolin" type errors.
    // The base DrizzleAdapter's generated queries hit a Postgres type mismatch
    // in our deployment environment.
    return {
      ...baseAdapter,
      createVerificationToken: async (
        token: VerificationToken
      ): Promise<VerificationToken> => {
        if (!db) throw new Error("Database not available");
        await db.execute(sql`
          INSERT INTO "verificationToken" ("identifier", "token", "expires")
          VALUES (${token.identifier}, ${token.token}, ${token.expires})
        `);
        return token;
      },
      useVerificationToken: async (params: {
        identifier: string;
        token: string;
      }): Promise<VerificationToken | null> => {
        if (!db) return null;
        const result = await db.execute(sql`
          DELETE FROM "verificationToken"
          WHERE "identifier" = ${params.identifier} AND "token" = ${params.token}
          RETURNING *
        `);
        if (result.rowCount === 0) {
          return null;
        }
        const row = result.rows[0] as any;
        return {
          identifier: row.identifier,
          token: row.token,
          expires: new Date(row.expires),
        };
      },
    };
  } catch (error) {
    console.error("Auth adapter: Failed to create Drizzle adapter:", error);
    return undefined;
  }
}

export const adapter: Adapter | undefined = createAdapter();