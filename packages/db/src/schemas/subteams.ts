import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./auth";

// Club subteams: the standing groups that run the club (events, marketing,
// tech...) that members apply to join. Separate from `initiative` on purpose —
// a subteam is run by staff, has no project leader and no seat cap, and asks
// its own questions instead of a single pitch.

/** One prompt on a subteam's application form. */
export type SubteamQuestion = {
  id: string;
  prompt: string;
  required: boolean;
};

/**
 * One answer, with the prompt copied in. Admins edit questions after people
 * have applied; without the copy an old answer would sit under whatever the
 * question says now, or under nothing once it is deleted.
 */
export type SubteamAnswer = {
  questionId: string;
  prompt: string;
  answer: string;
};

// The questions live on the row as jsonb rather than in a child table: they
// are a handful of prompts, always read and written together with the
// subteam, and never queried on their own. A child table would need a diff on
// every save and soft-deleted rows to keep old answers readable, which the
// prompt copy in SubteamAnswer already does.
export const subteams = pgTable(
  "subteam",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    /** One line, shown on the listing. */
    summary: text("summary"),
    /** What a member of this subteam actually does. */
    description: text("description"),
    questions: jsonb("questions")
      .$type<SubteamQuestion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Closed by default, so a subteam is never taking applications before its
    // questions are written.
    isOpen: boolean("is_open").notNull().default(false),
    /** Archived is hidden from members; its applications stay on the record. */
    archivedAt: timestamp("archived_at"),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("subteam_archived_idx").on(table.archivedAt)],
);

export type Subteam = typeof subteams.$inferSelect;

// `removed` is an accepted member taken off the roster — kept apart from
// `rejected` so the history says which of the two happened.
export const subteamApplicationStatuses = [
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
  "removed",
] as const;
export type SubteamApplicationStatus =
  (typeof subteamApplicationStatuses)[number];

// A new row per application, never a reused one: the history of who applied,
// was turned down and applied again is the point. The partial unique index is
// what holds "one active application per member per subteam" — two rows can
// both be pending only if the database lets them, and it does not.
export const subteamApplications = pgTable(
  "subteam_application",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subteamId: uuid("subteam_id")
      .notNull()
      .references(() => subteams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: subteamApplicationStatuses })
      .notNull()
      .default("pending"),
    answers: jsonb("answers")
      .$type<SubteamAnswer[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Anything else they want the admins to know. */
    note: text("note"),
    appliedAt: timestamp("applied_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
    decidedById: text("decided_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** The admin's note on the latest decision, shown to the applicant. */
    decisionNote: text("decision_note"),
  },
  (table) => [
    index("subteam_application_subteam_idx").on(table.subteamId),
    index("subteam_application_user_idx").on(table.userId),
    uniqueIndex("subteam_application_active_idx")
      .on(table.subteamId, table.userId)
      .where(sql`${table.status} in ('pending', 'accepted')`),
  ],
);

export type SubteamApplication = typeof subteamApplications.$inferSelect;

export const subteamsRelations = relations(subteams, ({ many }) => ({
  applications: many(subteamApplications),
}));

export const subteamApplicationsRelations = relations(
  subteamApplications,
  ({ one }) => ({
    subteam: one(subteams, {
      fields: [subteamApplications.subteamId],
      references: [subteams.id],
    }),
    user: one(users, {
      fields: [subteamApplications.userId],
      references: [users.id],
    }),
  }),
);
