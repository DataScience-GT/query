import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("default"),
  systemName: text("system_name").notNull().default("DSGT Query Engine"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  requireEmailVerification: boolean("require_email_verification").notNull().default(true),
  maxEventCapacity: integer("max_event_capacity").notNull().default(500),
  allowPublicRegistration: boolean("allow_public_registration").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
