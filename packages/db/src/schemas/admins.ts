import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";

export const admins = pgTable("admin", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // "volunteer" is deliberately the weakest tier and is NOT full staff: it
  // exists so the six-to-ten people running check-in desks can scan badges
  // without holding the role that can delete the hackathon. isAdmin rejects
  // it; only the scanner procedures accept it.
  role: text("role", {
    enum: ["super_admin", "admin", "moderator", "volunteer"],
  })
    .notNull()
    .default("admin"),
  permissions: text("permissions").array(),
  isActive: boolean("is_active").notNull().default(true),
  // End of a fixed-term appointment, e.g. an officer granted the role for one
  // year. NULL is a standing appointment, which is what the founding super
  // admins hold, so the column revokes nothing on its own.
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const adminsRelations = relations(admins, ({ one }) => ({
  user: one(users, {
    fields: [admins.userId],
    references: [users.id],
  }),
}));
