import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { hackathons } from "./hackathons";
import { VOLUNTEER_MODE_IDS, VOLUNTEER_STATUSES } from "../constants";
import type { VolunteerAnswers } from "../constants";

// A person's application to volunteer at one edition. Apart from `judge`: a
// volunteer runs the weekend, a judge scores projects, and the two ask
// different things. Approval here does not grant the "volunteer" staff tier
// (check-in scanner access); organisers do that on the Staff page.
//
// `answers` is what the form asked (see VolunteerAnswers), validated by the
// zod schema in @query/api before it is written. The phone inside it is for
// day-of contact.
export const hackathonVolunteerApplications = pgTable(
  "hackathon_volunteer_application",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    status: text("status", { enum: VOLUNTEER_STATUSES })
      .notNull()
      .default("pending"),
    // How they want to help: at the venue, as an online mentor, or both. Also
    // inside `answers` (which picks the questions), but a column so the
    // roster can filter and index on it. Always written from the parsed
    // answers; the default only keeps a push onto a table with rows additive.
    mode: text("mode", { enum: VOLUNTEER_MODE_IDS })
      .notNull()
      .default("in_person"),
    answers: jsonb("answers").$type<VolunteerAnswers>().notNull(),
    // The organiser who last approved or declined. Kept when they leave the
    // roster: the decision outlives the account.
    reviewedById: text("reviewed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One application per person per edition. A unique index, not a
    // constraint, like judge: see judge.ts. It also makes a double submit
    // collapse into one row, and its leading column serves the by-user reads.
    uniqueIndex("hackathon_volunteer_application_user_hackathon_idx").on(
      table.userId,
      table.hackathonId,
    ),
    // The admin list: one edition, filtered by status or by how they help.
    index("hackathon_volunteer_application_hackathon_status_idx").on(
      table.hackathonId,
      table.status,
    ),
    index("hackathon_volunteer_application_hackathon_mode_idx").on(
      table.hackathonId,
      table.mode,
    ),
  ],
);

export type HackathonVolunteerApplication =
  typeof hackathonVolunteerApplications.$inferSelect;
