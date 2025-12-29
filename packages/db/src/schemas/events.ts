// packages/db/src/schemas/events.ts
import { pgTable, text, timestamp, uuid, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { members } from "./members";

// Events table
export const events = pgTable("event", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),

  // Event settings
  maxAttendees: integer("max_attendees"),
  currentAttendees: integer("current_attendees").default(0).notNull(),
  requiresRSVP: boolean("requires_rsvp").default(false).notNull(),
  isPublic: boolean("is_public").default(true).notNull(),

  // QR Code settings
  qrCode: text("qr_code").notNull().unique(),
  qrCodeUrl: text("qr_code_url"),
  checkInEnabled: boolean("check_in_enabled").default(true).notNull(),
  checkInStartTime: timestamp("check_in_start_time"),
  checkInEndTime: timestamp("check_in_end_time"),

  // Categorization
  category: text("category"),
  tags: text("tags").array().default([]).notNull(),

  // Points/rewards
  attendancePoints: integer("attendance_points").default(0).notNull(),

  // Additional info
  imageUrl: text("image_url"),
  externalUrl: text("external_url"),

  // Metadata
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["draft", "published", "cancelled", "completed"]
  }).notNull().default("draft"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Event RSVPs
export const eventRSVPs = pgTable("event_rsvp", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .references(() => members.id, { onDelete: "set null" }),

  status: text("status", {
    enum: ["pending", "confirmed", "declined", "waitlist"]
  }).notNull().default("pending"),

  rsvpedAt: timestamp("rsvped_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Event Check-ins
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

  // Check-in details
  checkInMethod: text("check_in_method", {
    enum: ["qr_code", "manual", "nfc"]
  }).notNull(),
  checkInLocation: text("check_in_location"),

  // Validation
  isValidated: boolean("is_validated").default(true).notNull(),
  validatedById: text("validated_by_id")
    .references(() => users.id, { onDelete: "set null" }),

  // Metadata
  deviceInfo: jsonb("device_info"),
  ipAddress: text("ip_address"),

  checkInAt: timestamp("check_in_at").defaultNow().notNull(),
});

// Relations
export const eventsRelations = relations(events, ({ one, many }) => ({
  creator: one(users, {
    fields: [events.createdById],
    references: [users.id],
  }),
  rsvps: many(eventRSVPs),
  checkIns: many(eventCheckIns),
}));

export const eventRSVPsRelations = relations(eventRSVPs, ({ one }) => ({
  event: one(events, {
    fields: [eventRSVPs.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventRSVPs.userId],
    references: [users.id],
  }),
  member: one(members, {
    fields: [eventRSVPs.memberId],
    references: [members.id],
  }),
}));

export const eventCheckInsRelations = relations(eventCheckIns, ({ one }) => ({
  event: one(events, {
    fields: [eventCheckIns.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventCheckIns.userId],
    references: [users.id],
  }),
  member: one(members, {
    fields: [eventCheckIns.memberId],
    references: [members.id],
  }),
  validator: one(users, {
    fields: [eventCheckIns.validatedById],
    references: [users.id],
  }),
}));