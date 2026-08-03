import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const securitySeverityEnum = pgEnum("security_severity", [
  "info",
  "warn",
  "critical",
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id"), // Nullable, as text to match NextAuth ID or "system"
    action: text("action").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    severity: securitySeverityEnum("severity").default("info").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_user_id_idx").on(table.userId),
    index("audit_action_idx").on(table.action),
    index("audit_created_at_idx").on(table.createdAt),
    index("audit_severity_idx").on(table.severity),
  ],
);
