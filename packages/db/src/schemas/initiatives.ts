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
import { hackathons } from "./hackathons";

/**
 * Club initiatives: things a project leader runs year-round that members apply
 * to join. Named `initiative` rather than `project` because a hackathon
 * "project" is already a judged submission, and one word for both would make
 * every query and conversation ambiguous.
 */

/**
 * The project-leader role, as its own assignment table rather than a value on
 * `admin.role` — a leader is an elevated member, not staff, and nothing here
 * should widen an existing admin check. Scoped per hackathon edition, the same
 * way `judge` and `member` are.
 */
export const projectLeaders = pgTable(
  "project_leader",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    /** Revoked by clearing this, so the appointment stays on the record. */
    isActive: boolean("is_active").notNull().default(true),
    appointedBy: text("appointed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("project_leader_user_id_idx").on(table.userId),
    index("project_leader_hackathon_id_idx").on(table.hackathonId),
    unique("unique_project_leader_per_hackathon").on(
      table.userId,
      table.hackathonId,
    ),
  ],
);

export type ProjectLeader = typeof projectLeaders.$inferSelect;

/** draft is invisible to members, open takes applications, closed stops them. */
export const initiativeStatuses = ["draft", "open", "closed"] as const;
export type InitiativeStatus = (typeof initiativeStatuses)[number];

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
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
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
    /** Null means uncapped. Zero would be an initiative nobody can join. */
    maxMembers: integer("max_members"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("initiative_hackathon_id_idx").on(table.hackathonId),
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
  hackathon: one(hackathons, {
    fields: [projectLeaders.hackathonId],
    references: [hackathons.id],
  }),
}));

export const initiativesRelations = relations(initiatives, ({ one, many }) => ({
  leader: one(users, {
    fields: [initiatives.leaderUserId],
    references: [users.id],
  }),
  hackathon: one(hackathons, {
    fields: [initiatives.hackathonId],
    references: [hackathons.id],
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
