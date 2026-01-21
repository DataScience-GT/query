import { pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { members } from "./members";

/**
 * Stores Stripe checkout/payment info from webhooks.
 * Used to track payments before they're linked to a user account.
 */
export const stripePayments = pgTable("stripe_payment", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Stripe identifiers
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),

  // Customer info from Stripe
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name"),

  // Payment details
  amountTotal: integer("amount_total"), // in cents
  currency: text("currency").default("usd"),
  paymentStatus: text("payment_status", {
    enum: ["paid", "unpaid", "no_payment_required"]
  }).notNull(),

  // Linking status
  linkedUserId: text("linked_user_id").references(() => users.id, { onDelete: "set null" }),
  linkedAt: timestamp("linked_at"),

  // Metadata
  metadata: text("metadata"), // JSON string for any extra Stripe metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Links users who signed in with a different email (e.g., Google)
 * to their Stripe payment record.
 */
export const userAccountLinks = pgTable("user_account_link", {
  id: uuid("id").defaultRandom().primaryKey(),

  // The user who linked (signed in via Google, etc.)
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // The Stripe payment being linked
  stripePaymentId: uuid("stripe_payment_id")
    .notNull()
    .references(() => stripePayments.id, { onDelete: "cascade" }),

  // Info provided during linking (for verification)
  providedFirstName: text("provided_first_name").notNull(),
  providedLastName: text("provided_last_name").notNull(),
  providedEmail: text("provided_email").notNull(),

  // Status
  isVerified: boolean("is_verified").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const stripePaymentsRelations = relations(stripePayments, ({ one, many }) => ({
  linkedUser: one(users, {
    fields: [stripePayments.linkedUserId],
    references: [users.id],
  }),
  accountLinks: many(userAccountLinks),
}));

export const userAccountLinksRelations = relations(userAccountLinks, ({ one }) => ({
  user: one(users, {
    fields: [userAccountLinks.userId],
    references: [users.id],
  }),
  stripePayment: one(stripePayments, {
    fields: [userAccountLinks.stripePaymentId],
    references: [stripePayments.id],
  }),
}));
