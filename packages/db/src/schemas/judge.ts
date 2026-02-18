import { pgTable, text, timestamp, uuid, boolean, integer, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { hackathons, hackathonProjects } from "./hackathons";

export const judges = pgTable("judge", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  specialty: text("specialty"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("judge_user_id_idx").on(table.userId),
]);

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
}, (table) => [
  index("assignment_judge_id_idx").on(table.judgeId),
  index("assignment_hackathon_id_idx").on(table.hackathonId),
]);


// Projects with table numbers for judging (extends hackathon projects concept)
export const judgingProjects = pgTable("judging_project", {
  id: uuid("id").defaultRandom().primaryKey(),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  tableNumber: integer("table_number").notNull(),
  category: text("category"), // e.g., "AI", "Web3", "Health", "Sustainability"
  tracks: text("tracks").array(),
  challenges: text("challenges").array(),
  isCreateX: boolean("is_create_x").default(false),
  teamMembers: text("team_members"), // comma-separated or JSON string
  projectUrl: text("project_url"),
  repoUrl: text("repo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("judging_project_hackathon_id_idx").on(table.hackathonId),
  index("judging_project_table_idx").on(table.tableNumber),
]);

// Judge votes/scores for projects
export const judgeVotes = pgTable("judge_vote", {
  id: uuid("id").defaultRandom().primaryKey(),
  judgeId: uuid("judge_id")
    .notNull()
    .references(() => judges.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => judgingProjects.id, { onDelete: "cascade" }),
  score: integer("score").notNull(), // Total score (sum of all criteria, 5-50)
  // Rubric scores (1-10 each)
  scoreCreativity: integer("score_creativity"), // Creativity & Originality
  scoreImpact: integer("score_impact"), // Impact & Relevance
  scoreScope: integer("score_scope"), // Scope & Technical Depth
  scoreClarity: integer("score_clarity"), // Clarity & Engagement
  scoreSoundness: integer("score_soundness"), // Soundness & Accuracy
  comment: text("comment"),
  votedAt: timestamp("voted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("vote_judge_id_idx").on(table.judgeId),
  index("vote_project_id_idx").on(table.projectId),
  // Compound to enforce one vote per judge per project (app logic does this, index speeds up check)
  index("vote_unique_idx").on(table.judgeId, table.projectId),
]);

// Map images for hackathon venues
export const hackathonMaps = pgTable("hackathon_map", {
  id: uuid("id").defaultRandom().primaryKey(),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  name: text("name"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("map_hackathon_id_idx").on(table.hackathonId),
]);

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
}, (table) => [
  index("queue_judge_id_idx").on(table.judgeId),
  index("queue_hackathon_id_idx").on(table.hackathonId),
  // Critical for "next table" logic
  index("queue_todo_idx").on(table.judgeId, table.hackathonId, table.isCompleted),
]);

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
