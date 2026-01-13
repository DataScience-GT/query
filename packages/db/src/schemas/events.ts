import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { members } from "./members";

export const events = pgTable("event", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  eventDate: timestamp("event_date").notNull(),
  pointsValue: integer("points_value").notNull().default(10),
  qrCode: text("qr_code").notNull().unique(),
  checkInEnabled: boolean("check_in_enabled").notNull().default(true),
  maxCheckIns: integer("max_check_ins"),
  currentCheckIns: integer("current_check_ins").notNull().default(0),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const eventCheckIns = pgTable("event_check_in", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .references(() => members.id, { onDelete: "set null" }),
  checkInMethod: text("check_in_method", { enum: ["qr_code", "manual"] })
    .notNull()
    .default("qr_code"),
  pointsEarned: integer("points_earned").notNull().default(10),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
});

// Relations
export const eventsRelations = relations(events, ({ one, many }) => ({
  createdBy: one(users, { fields: [events.createdById], references: [users.id] }),
  checkIns: many(eventCheckIns),
}));

export const eventCheckInsRelations = relations(eventCheckIns, ({ one }) => ({
  event: one(events, { fields: [eventCheckIns.eventId], references: [events.id] }),
  user: one(users, { fields: [eventCheckIns.userId], references: [users.id] }),
  member: one(members, { fields: [eventCheckIns.memberId], references: [members.id] }),
}));