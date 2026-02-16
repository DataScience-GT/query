import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, users, accounts, sessions, verificationTokens } from "@query/db";
import { sql } from "drizzle-orm";
import type { Adapter, VerificationToken } from "next-auth/adapters";

function createAdapter(): Adapter | undefined {
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

    return {
      ...baseAdapter,
      // createVerificationToken: use DrizzleAdapter's default — it works fine.
      // Only useVerificationToken needs raw SQL to avoid the Drizzle "boolin"
      // type error on DELETE queries in our deployment environment.
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