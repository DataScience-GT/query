import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { members } from "./members";

// A bootcamp session is an event, not a table of its own: mark one as week N
// of a term and the QR flow, the check-in constraint and the capacity lock
// already carry its attendance. Attendance IS `event_check_in`.
export const events = pgTable(
  "event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    eventDate: timestamp("event_date").notNull(),
    qrCode: text("qr_code").notNull().unique(),
    checkInEnabled: boolean("check_in_enabled").notNull().default(true),
    // A kickoff or interest meeting is run to recruit members, so refusing
    // everyone who is not one yet leaves exactly those events with no recordable
    // attendance. Defaults true so existing events keep their behaviour.
    membersOnly: boolean("members_only").notNull().default(true),
    /** Week N of the bootcamp. Null on every event that is not a session. */
    bootcampWeek: integer("bootcamp_week"),
    // Which bootcamp it belongs to, as `2026-fall`. Server-set. Without it the
    // grid stacks every semester together and week 1 is usable once, ever.
    bootcampTerm: text("bootcamp_term"),
    /** Refuses anyone whose bootcamp enrolment is not for the current term. */
    bootcampOnly: boolean("bootcamp_only").notNull().default(false),
    maxCheckIns: integer("max_check_ins"),
    currentCheckIns: integer("current_check_ins").notNull().default(0),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // One event per week per bootcamp. Nulls count as distinct in Postgres, so
    // ordinary events all carry (null, null) and never collide. Table order, not
    // readability order: push introspects it this way and a reversed spelling
    // diffs against itself forever.
    unique("unique_bootcamp_session").on(table.bootcampWeek, table.bootcampTerm),
    // Both bootcamp pages read every session of one term.
    index("event_bootcamp_term_idx").on(table.bootcampTerm),
  ],
);

export const eventCheckIns = pgTable(
  "event_check_in",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    checkInMethod: text("check_in_method", { enum: ["qr_code", "manual"] })
      .notNull()
      .default("qr_code"),
    checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  },
  (table) => [
    // A person is at a given event once. events.checkIn already treats a 23505
    // here as "Already checked in" and its row lock keeps the QR door honest, but
    // the constraint is what holds for any future manual or imported check-in.
    unique("unique_event_check_in").on(table.eventId, table.userId),
    // The unique above leads with eventId, so a lookup by user alone cannot use
    // it. events.myEvents and myStats filter on exactly userId and run on every
    // portal dashboard load — without this they scan the whole check-in table.
    index("event_check_in_user_id_idx").on(table.userId),
  ],
);

// Relations
export const eventsRelations = relations(events, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [events.createdById],
    references: [users.id],
  }),
  checkIns: many(eventCheckIns),
}));

export const eventCheckInsRelations = relations(eventCheckIns, ({ one }) => ({
  event: one(events, {
    fields: [eventCheckIns.eventId],
    references: [events.id],
  }),
  user: one(users, { fields: [eventCheckIns.userId], references: [users.id] }),
  member: one(members, {
    fields: [eventCheckIns.memberId],
    references: [members.id],
  }),
}));
