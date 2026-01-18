import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { hackathons, hackathonProjects } from "./hackathons";

// Judges - users who can judge hackathon projects
export const judges = pgTable("judge", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Judge assignments to specific hackathons
export const judgeAssignments = pgTable("judge_assignment", {
  id: uuid("id").defaultRandom().primaryKey(),
  judgeId: uuid("judge_id")
    .notNull()
    .references(() => judges.id, { onDelete: "cascade" }),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  isLead: boolean("is_lead").notNull().default(false),
});

// Projects with table numbers for judging (extends hackathon projects concept)
export const judgingProjects = pgTable("judging_project", {
  id: uuid("id").defaultRandom().primaryKey(),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  tableNumber: integer("table_number").notNull(),
  teamMembers: text("team_members"), // comma-separated or JSON string
  projectUrl: text("project_url"),
  repoUrl: text("repo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Judge votes/scores for projects
export const judgeVotes = pgTable("judge_vote", {
  id: uuid("id").defaultRandom().primaryKey(),
  judgeId: uuid("judge_id")
    .notNull()
    .references(() => judges.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => judgingProjects.id, { onDelete: "cascade" }),
  score: integer("score").notNull(), // e.g., 1-10 or 1-5
  comment: text("comment"),
  votedAt: timestamp("voted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Map images for hackathon venues
export const hackathonMaps = pgTable("hackathon_map", {
  id: uuid("id").defaultRandom().primaryKey(),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  name: text("name"), // e.g., "Floor 1", "Main Hall"
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Track which tables a judge still needs to visit
export const judgeQueue = pgTable("judge_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  judgeId: uuid("judge_id")
    .notNull()
    .references(() => judges.id, { onDelete: "cascade" }),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => judgingProjects.id, { onDelete: "cascade" }),
  order: integer("order").notNull(), // order to visit
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
});

// Relations
export const judgesRelations = relations(judges, ({ one, many }) => ({
  user: one(users, {
    fields: [judges.userId],
    references: [users.id],
  }),
  assignments: many(judgeAssignments),
  votes: many(judgeVotes),
  queue: many(judgeQueue),
}));

export const judgeAssignmentsRelations = relations(judgeAssignments, ({ one }) => ({
  judge: one(judges, {
    fields: [judgeAssignments.judgeId],
    references: [judges.id],
  }),
  hackathon: one(hackathons, {
    fields: [judgeAssignments.hackathonId],
    references: [hackathons.id],
  }),
}));

export const judgingProjectsRelations = relations(judgingProjects, ({ one, many }) => ({
  hackathon: one(hackathons, {
    fields: [judgingProjects.hackathonId],
    references: [hackathons.id],
  }),
  votes: many(judgeVotes),
  queueEntries: many(judgeQueue),
}));

export const judgeVotesRelations = relations(judgeVotes, ({ one }) => ({
  judge: one(judges, {
    fields: [judgeVotes.judgeId],
    references: [judges.id],
  }),
  project: one(judgingProjects, {
    fields: [judgeVotes.projectId],
    references: [judgingProjects.id],
  }),
}));

export const hackathonMapsRelations = relations(hackathonMaps, ({ one }) => ({
  hackathon: one(hackathons, {
    fields: [hackathonMaps.hackathonId],
    references: [hackathons.id],
  }),
}));

export const judgeQueueRelations = relations(judgeQueue, ({ one }) => ({
  judge: one(judges, {
    fields: [judgeQueue.judgeId],
    references: [judges.id],
  }),
  hackathon: one(hackathons, {
    fields: [judgeQueue.hackathonId],
    references: [hackathons.id],
  }),
  project: one(judgingProjects, {
    fields: [judgeQueue.projectId],
    references: [judgingProjects.id],
  }),
}));
