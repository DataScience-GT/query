import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

// Single-row table: `id` is always "default". Modelled after the table that
// already exists in the database so `drizzle-kit push` treats it as unchanged.
export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("default"),
  systemName: text("system_name").notNull().default("DSGT Query Engine"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  requireEmailVerification: boolean("require_email_verification")
    .notNull()
    .default(true),
  maxEventCapacity: integer("max_event_capacity").notNull().default(500),
  allowPublicRegistration: boolean("allow_public_registration")
    .notNull()
    .default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
