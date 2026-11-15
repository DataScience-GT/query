import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccount } from "next-auth/adapters";

export const users = pgTable(
  "user",
  {
    id: text("id").notNull().primaryKey(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
    image: text("image"),
  },
  (table) => [
    // For the exact-match lookups (admin grant, manual check-in, bans).
    index("user_email_idx").on(table.email),
    // One account per address, case-insensitive: the auth adapter looks users
    // up by lower(email) and assumes one row comes back, while providers keep
    // whatever casing the address was typed in.
    uniqueIndex("user_email_lower_unique_idx").on(sql`lower(${table.email})`),
    index("user_name_idx").on(table.name),
  ],
);

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    index("account_user_id_idx").on(account.userId),
  ],
);

export const sessions = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").notNull().primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
    // Wrong guesses against this identifier's sign-in code. Counted here, not
    // in the per-instance rate limiter, so every instance sees the same total
    // and a code dies after MAX_CODE_ATTEMPTS misses however requests spread.
    attempts: integer("attempts").notNull().default(0),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);
