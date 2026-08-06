import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
  uniqueIndex,
  unique,
  numeric,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./auth";
import { hackathons, hackathonProjects } from "./hackathons";

export const judges = pgTable(
  "judge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    title: text("title"),
    specialty: text("specialty"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    previousExperience: text("previous_experience"),
    dietaryRestrictions: text("dietary_restrictions").array(),
    shirtSize: text("shirt_size"),
    whyJudge: text("why_judge"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("judge_user_id_idx").on(table.userId),
    index("judge_hackathon_id_idx").on(table.hackathonId),
    unique("unique_judge_per_hackathon").on(table.userId, table.hackathonId),
  ],
);


export const judgeAssignments = pgTable(
  "judge_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judges.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    isLead: boolean("is_lead").notNull().default(false),
    track: text("track"),
  },
  (table) => [
    index("assignment_judge_id_idx").on(table.judgeId),
    index("assignment_hackathon_id_idx").on(table.hackathonId),
    // assignToHackathon and judge.register both enforce one assignment per
    // judge per hackathon with a read before the insert.
    unique("unique_assignment_per_hackathon").on(
      table.judgeId,
      table.hackathonId,
    ),
  ],
);

// Projects with table numbers for judging (extends hackathon projects concept)
export const judgingProjects = pgTable(
  "judging_project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    // The submission this judgeable entry was promoted from. Judging runs on
    // this table while participants submit into hackathon_project, and without
    // this column the two halves share no key at all — a winner could not be
    // mapped back to the team that built it.
    sourceProjectId: uuid("source_project_id").references(
      () => hackathonProjects.id,
      { onDelete: "cascade" },
    ),
    name: text("name").notNull(),
    description: text("description"),
    tableNumber: integer("table_number").notNull(),
    zone: text("zone"),
    category: text("category"), // e.g., "AI", "Web3", "Health", "Sustainability"
    teamMembers: text("team_members"), // comma-separated or JSON string
    projectUrl: text("project_url"),
    repoUrl: text("repo_url"),
    tracks: text("tracks").array(), // Enum: Sports, Entertainment, Finance, Healthcare, databricks, sphinx, growth factor, figma, actian, safety kit, GEN-AI, CYBER, NONE
    challenges: text("challenges").array(), // Enum: AGG, ASSURANT, AWS, CAPONE, GROWTH, MLH_MONGODB, MLH_STREAMLIT, MLH_TECH, MLH_CLOUDFLARE, MLH_REACH_CAPITAL
    isCreateX: boolean("is_create_x").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("judging_project_hackathon_id_idx").on(table.hackathonId),
    index("judging_project_table_idx").on(table.tableNumber),
    // A table number identifies one physical table at one event. Without this,
    // a retried CSV import appends the entire project list a second time with
    // fresh numbers, and judges get routed to tables that do not exist.
    uniqueIndex("judging_project_table_unique").on(
      table.hackathonId,
      table.tableNumber,
    ),
    // Partial: one judgeable entry per submission, while still allowing any
    // number of rows that came from nowhere. This is what makes promoting
    // submissions safe to re-run as teams keep submitting.
    uniqueIndex("judging_project_source_unique")
      .on(table.sourceProjectId)
      .where(sql`${table.sourceProjectId} is not null`),
  ],
);

// Judge votes/scores for projects
export const judgeVotes = pgTable(
  "judge_vote",
  {
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
    durationSeconds: integer("duration_seconds"), // how long the judge spent on this project
    votedAt: timestamp("voted_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("vote_judge_id_idx").on(table.judgeId),
    index("vote_project_id_idx").on(table.projectId),
    // Unique constraint: one vote per judge per project (enforced at DB level)
    uniqueIndex("vote_unique_idx").on(table.judgeId, table.projectId),
  ],
);

/**
 * A frozen placing, computed once when judging closes.
 *
 * getRankings recomputes the whole ordering on every call, and its z-score
 * normalisation runs over the entire vote set — so one late vote silently
 * changes every project's score, including ones already announced. The
 * ordering existed only inside an HTTP response; nothing in the product could
 * say who won yesterday.
 *
 * A snapshot instead: computed deliberately, reviewable while unpublished, and
 * unchanged by anything that happens to the votes afterwards.
 */
export const hackathonResults = pgTable(
  "hackathon_result",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => judgingProjects.id, { onDelete: "cascade" }),
    /** Carried across at compute time so results survive the judging tables
     *  and can name the team that actually built the thing. */
    sourceProjectId: uuid("source_project_id").references(
      () => hackathonProjects.id,
      { onDelete: "set null" },
    ),
    /** Which prize this placing is for. Null is the overall ranking. */
    track: text("track"),
    placement: integer("placement").notNull(),
    /** The blended score at the moment of computation. `numeric` because the
     *  pipeline produces a float — hackathon_project.score is an integer and
     *  could never have held this value. */
    weightedScore: numeric("weighted_score", { precision: 6, scale: 2 }),
    voteCount: integer("vote_count").notNull().default(0),
    /** Null while the snapshot is a draft. Set on publish; cleared on
     *  unpublish, which is what makes publishing reversible. */
    publishedAt: timestamp("published_at"),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => [
    index("result_hackathon_idx").on(table.hackathonId),
    // One placing per project per prize. Recomputing upserts onto this rather
    // than appending a second, contradictory ordering.
    uniqueIndex("result_unique_placing").on(
      table.hackathonId,
      table.projectId,
      table.track,
    ),
  ],
);

// Track which tables a judge still needs to visit
export const judgeQueue = pgTable(
  "judge_queue",
  {
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
    // Stamped when this project is handed to the judge, so a second judge whose
    // queue reaches the same table can pass over it and come back later instead
    // of crowding the team. Treated as a claim only while it is recent
    // (JUDGE_CLAIM_MINUTES) — a judge who closes the tab releases the table on
    // their own rather than blocking it until an admin steps in.
    startedAt: timestamp("started_at"),
  },
  (table) => [
    index("queue_judge_id_idx").on(table.judgeId),
    index("queue_hackathon_id_idx").on(table.hackathonId),
    // Critical for "next table" logic
    index("queue_todo_idx").on(
      table.judgeId,
      table.hackathonId,
      table.isCompleted,
    ),
    // Answers "is anyone else at this table right now" for the claim check.
    index("queue_project_active_idx").on(
      table.projectId,
      table.isCompleted,
      table.startedAt,
    ),
  ],
);

// Relations
export const judgesRelations = relations(judges, ({ one, many }) => ({
  user: one(users, {
    fields: [judges.userId],
    references: [users.id],
  }),
  hackathon: one(hackathons, {
    fields: [judges.hackathonId],
    references: [hackathons.id],
  }),
  assignments: many(judgeAssignments),
  votes: many(judgeVotes),
  queue: many(judgeQueue),
}));

export const judgeAssignmentsRelations = relations(
  judgeAssignments,
  ({ one }) => ({
    judge: one(judges, {
      fields: [judgeAssignments.judgeId],
      references: [judges.id],
    }),
    hackathon: one(hackathons, {
      fields: [judgeAssignments.hackathonId],
      references: [hackathons.id],
    }),
  }),
);

export const judgingProjectsRelations = relations(
  judgingProjects,
  ({ one, many }) => ({
    hackathon: one(hackathons, {
      fields: [judgingProjects.hackathonId],
      references: [hackathons.id],
    }),
    votes: many(judgeVotes),
    queueEntries: many(judgeQueue),
  }),
);

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

export const hackathonResultsRelations = relations(
  hackathonResults,
  ({ one }) => ({
    hackathon: one(hackathons, {
      fields: [hackathonResults.hackathonId],
      references: [hackathons.id],
    }),
    project: one(judgingProjects, {
      fields: [hackathonResults.projectId],
      references: [judgingProjects.id],
    }),
    sourceProject: one(hackathonProjects, {
      fields: [hackathonResults.sourceProjectId],
      references: [hackathonProjects.id],
    }),
  }),
);

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
