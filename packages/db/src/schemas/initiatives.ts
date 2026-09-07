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

// Club initiatives: things a project leader runs year-round that members
// apply to join. Named `initiative` rather than `project` because a hackathon
// project is already a judged submission. Deliberately unscoped by hackathon
// — tying these to an edition meant a club project belonged to whichever
// hackathon was current that day and vanished when staff drafted the next.

// The project-leader role, as its own assignment table rather than a value on
// `admin.role`: a leader is an elevated member, not staff. One row per
// person, not per edition — leading is a standing appointment, so nobody
// loses their initiatives when an edition rolls over.
export const projectLeaders = pgTable(
  "project_leader",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Revoked by clearing this, so the appointment stays on the record. */
    isActive: boolean("is_active").notNull().default(true),
    appointedBy: text("appointed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // The unique constraint below indexes user_id already.
    unique("unique_project_leader").on(table.userId),
  ],
);

export type ProjectLeader = typeof projectLeaders.$inferSelect;

// The whole lifecycle, including the one a member starts. A member with no
// leader role proposes; it sits at `proposed` until an admin reviews.
// Approving moves it to `draft` and grants the leader role, so approval never
// publishes a half-written page. Declining parks it at `declined` with a
// note. Only `open` is visible to members; an existing leader creates
// straight into `draft`.
export const initiativeStatuses = [
  "proposed",
  "declined",
  "draft",
  "open",
  "closed",
] as const;
export type InitiativeStatus = (typeof initiativeStatuses)[number];

/** What a leader may set directly — the review states are not theirs to pick. */
export const leaderSettableStatuses = ["draft", "open", "closed"] as const;

// No accepted-seat counter on purpose: every writer takes a row lock on the
// initiative first, so accepted rows are counted directly and no second
// number can drift. `leaderUserId` points at the user, not project_leader.id,
// so revoking a role leaves their initiatives intact and attributable.
export const initiatives = pgTable(
  "initiative",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leaderUserId: text("leader_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    description: text("description"),
    commitment: text("commitment"),
    status: text("status", { enum: initiativeStatuses })
      .notNull()
      .default("draft"),
    // How many people the leader may accept, not counting themselves — a team of
    // four is a leader plus three at `maxMembers = 3`. Null means uncapped; zero
    // would be an initiative nobody can join.
    maxMembers: integer("max_members"),
    archivedAt: timestamp("archived_at"),
    /** Set when an admin approves or declines a proposal. */
    reviewedAt: timestamp("reviewed_at"),
    reviewedById: text("reviewed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** The admin's note back to the proposer, shown on a decline. */
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("initiative_leader_idx").on(table.leaderUserId),
    index("initiative_status_idx").on(table.status),
  ],
);

export type Initiative = typeof initiatives.$inferSelect;

export const applicationStatuses = [
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

// `withdrawn` is a state rather than a deleted row: the unique index stops a
// double submission and has to keep holding while somebody is gone, so
// re-applying reuses the row instead of racing a second insert.
export const initiativeApplications = pgTable(
  "initiative_application",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    initiativeId: uuid("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: applicationStatuses })
      .notNull()
      .default("pending"),
    /** Why they want to join, in their words. */
    pitch: text("pitch"),
    // The resume as a data URL. No object storage exists here — profile images
    // already live in the database the same way — so it is capped at 2 MB of
    // PDF and never selected by the queue query, only by applicantResume.
    resumeFileName: text("resume_file_name"),
    resumeData: text("resume_data"),
    resumeUploadedAt: timestamp("resume_uploaded_at"),
    // Re-stamped on re-apply, so the leader's queue is ordered by when the hand
    // actually went up.
    appliedAt: timestamp("applied_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
    decidedById: text("decided_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("initiative_application_initiative_idx").on(table.initiativeId),
    index("initiative_application_user_idx").on(table.userId),
    unique("unique_application_per_initiative").on(
      table.initiativeId,
      table.userId,
    ),
  ],
);

export type InitiativeApplication = typeof initiativeApplications.$inferSelect;

export const projectLeadersRelations = relations(projectLeaders, ({ one }) => ({
  user: one(users, { fields: [projectLeaders.userId], references: [users.id] }),
}));

export const initiativesRelations = relations(initiatives, ({ one, many }) => ({
  leader: one(users, {
    fields: [initiatives.leaderUserId],
    references: [users.id],
  }),
  applications: many(initiativeApplications),
}));

export const initiativeApplicationsRelations = relations(
  initiativeApplications,
  ({ one }) => ({
    initiative: one(initiatives, {
      fields: [initiativeApplications.initiativeId],
      references: [initiatives.id],
    }),
    user: one(users, {
      fields: [initiativeApplications.userId],
      references: [users.id],
    }),
  }),
);
