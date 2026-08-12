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

/**
 * Club initiatives: things a project leader runs year-round that members apply
 * to join. Named `initiative` rather than `project` because a hackathon
 * "project" is already a judged submission, and one word for both would make
 * every query and conversation ambiguous.
 *
 * Deliberately unscoped by hackathon. The club and the hackathon are two
 * separate aspects of the platform: the hackathon has editions, registration,
 * teams and judging; the club has initiatives that run whenever somebody is
 * willing to lead one. Nothing here is ever judged — judges only ever score
 * `hackathon_project`. Tying these tables to an edition, as they were, meant a
 * club project silently belonged to whichever hackathon happened to be current
 * on the day it was created, and vanished from every list the moment staff
 * drafted the next one.
 */

/**
 * The project-leader role, as its own assignment table rather than a value on
 * `admin.role` — a leader is an elevated member, not staff, and nothing here
 * should widen an existing admin check.
 *
 * One row per person, not one per edition: leading is a standing appointment
 * that lasts until somebody revokes it, so there is no yearly re-grant and
 * nobody loses their initiatives when an edition rolls over.
 */
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

/**
 * The whole lifecycle, including the one a member starts.
 *
 * A member with no leader role proposes an initiative; it sits at `proposed`
 * until an admin reviews it. Approving moves it to `draft` and grants the
 * proposer the leader role, so they finish writing it and open it themselves —
 * approval never publishes a half-written page to members. Declining parks it
 * at `declined` with a note the proposer can read.
 *
 * Only `open` is ever visible to members. An existing leader skips the first
 * two states entirely and creates straight into `draft`.
 */
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

/**
 * No accepted-seat counter here on purpose: every writer takes a row lock on
 * the initiative first, so the accepted rows are counted directly and there is
 * no second number that can drift.
 *
 * `leaderUserId` points at the user, not at `project_leader.id`, so revoking
 * somebody's role leaves their initiatives intact and still attributable.
 */
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
    /**
     * How many people the leader may accept, not counting themselves — a team
     * of four is a leader plus three accepted members at `maxMembers = 3`.
     * Null means uncapped. Zero would be an initiative nobody can join.
     */
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

/**
 * `withdrawn` is a state rather than a deleted row: the unique index is what
 * stops a double submission, and it has to keep holding while somebody is gone
 * so re-applying reuses the row instead of racing a second insert against it.
 */
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
    pitch: text("pitch"),
    /** Re-stamped on re-apply, so the leader's queue is ordered by when the
     *  hand actually went up. */
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
