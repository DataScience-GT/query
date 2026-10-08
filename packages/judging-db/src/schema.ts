import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  comparisonOutcome,
  dispatchStrategy,
  eventPhase,
  judgeStatus,
  membershipRole,
  trackKind,
} from "./enums";

export {
  comparisonOutcome,
  dispatchStrategy,
  eventPhase,
  judgeStatus,
  membershipRole,
  trackKind,
};

export const organization = pgTable("organization", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  branding: jsonb("branding").notNull().default({}),
});

export const user = pgTable("panel_user", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
});

export const event = pgTable(
  "panel_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    phase: eventPhase("phase").notNull().default("setup"),
  },
  (table) => [uniqueIndex("event_org_slug_idx").on(table.orgId, table.slug)],
);

export const eventConfig = pgTable("event_config", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  targetSeconds: integer("target_seconds").notNull(),
  hardLimitSeconds: integer("hard_limit_seconds").notNull(),
  walkLimitSeconds: integer("walk_limit_seconds").notNull(),
  submitGraceSeconds: integer("submit_grace_seconds").notNull(),
  minLooksPerProject: integer("min_looks_per_project").notNull(),
  dispatchStrategy: dispatchStrategy("dispatch_strategy").notNull(),
  pairwiseEnabled: boolean("pairwise_enabled").notNull().default(false),
  pairwiseWeight: numeric("pairwise_weight", { mode: "number" }).notNull().default(0),
  bayesianC: numeric("bayesian_c", { mode: "number" }).notNull().default(2),
  calibrationLooks: integer("calibration_looks").notNull().default(0),
  calibrationWeight: numeric("calibration_weight", { mode: "number" })
    .notNull()
    .default(1),
  feedbackCardsEnabled: boolean("feedback_cards_enabled").notNull().default(false),
  leaderboardPublic: boolean("leaderboard_public").notNull().default(false),
  boardPollSeconds: integer("board_poll_seconds").notNull().default(5),
});

export const rubric = pgTable("rubric", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
});

export const criterion = pgTable(
  "criterion",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => rubric.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    min: numeric("min", { mode: "number" }).notNull(),
    max: numeric("max", { mode: "number" }).notNull(),
    weight: numeric("weight", { mode: "number" }).notNull(),
    anchors: jsonb("anchors").notNull().default([]),
  },
  (table) => [uniqueIndex("criterion_rubric_key_idx").on(table.rubricId, table.key)],
);

export const track = pgTable(
  "track",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: trackKind("kind").notNull(),
    judgeGroup: text("judge_group").notNull(),
    rubricId: uuid("rubric_id").references(() => rubric.id),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [uniqueIndex("track_event_slug_idx").on(table.eventId, table.slug)],
);

export const prize = pgTable(
  "prize",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => track.id, { onDelete: "cascade" }),
    place: integer("place").notNull(),
    title: text("title").notNull(),
    amount: numeric("amount", { mode: "number" }),
    description: text("description"),
  },
  (table) => [uniqueIndex("prize_track_place_idx").on(table.trackId, table.place)],
);

export const zone = pgTable("zone", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

/** Floor plan. The SQL name is floor_table because `table` is reserved. */
export const floorTable = pgTable(
  "floor_table",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    zoneId: uuid("zone_id").references(() => zone.id),
    x: numeric("x", { mode: "number" }),
    y: numeric("y", { mode: "number" }),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.number] })],
);

export const project = pgTable("project", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  name: text("name").notNull(),
  description: text("description"),
  teamName: text("team_name"),
  members: jsonb("members").notNull().default([]),
  links: jsonb("links").notNull().default({}),
  tableNumber: integer("table_number"),
  zoneId: uuid("zone_id").references(() => zone.id),
  qrToken: uuid("qr_token").notNull().unique().defaultRandom(),
  feedbackToken: uuid("feedback_token").unique(),
  arrivedFirstAt: timestamp("arrived_first_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
});

export const projectTrack = pgTable(
  "project_track",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => track.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.trackId] })],
);

export const judge = pgTable(
  "panel_judge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    org: text("org"),
    title: text("title"),
    status: judgeStatus("status").notNull().default("invited"),
    trackId: uuid("track_id").references(() => track.id),
    zoneId: uuid("zone_id").references(() => zone.id),
    isLead: boolean("is_lead").notNull().default(false),
  },
  (table) => [uniqueIndex("judge_event_email_idx").on(table.eventId, table.email)],
);

export const visit = pgTable(
  "visit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judge.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    judgeGroup: text("judge_group").notNull(),
    handedOutAt: timestamp("handed_out_at", { withTimezone: true }).notNull(),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
  },
  (table) => [
    uniqueIndex("visit_judge_project_open_idx")
      .on(table.judgeId, table.projectId)
      .where(sql`voided_at is null`),
    uniqueIndex("visit_one_open_idx")
      .on(table.judgeId)
      .where(sql`voided_at is null and completed_at is null`),
  ],
);

export const vote = pgTable("vote", {
  id: uuid("id").defaultRandom().primaryKey(),
  visitId: uuid("visit_id")
    .notNull()
    .unique()
    .references(() => visit.id, { onDelete: "cascade" }),
  judgeId: uuid("judge_id")
    .notNull()
    .references(() => judge.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  total: numeric("total", { mode: "number" }).notNull(),
  comment: text("comment"),
  durationSeconds: integer("duration_seconds"),
  isCalibration: boolean("is_calibration").notNull().default(false),
});

export const voteScore = pgTable(
  "vote_score",
  {
    voteId: uuid("vote_id")
      .notNull()
      .references(() => vote.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id")
      .notNull()
      .references(() => criterion.id),
    value: numeric("value", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.voteId, table.criterionId] })],
);

export const comparison = pgTable("comparison", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  judgeId: uuid("judge_id")
    .notNull()
    .references(() => judge.id, { onDelete: "cascade" }),
  judgeGroup: text("judge_group").notNull(),
  aProjectId: uuid("a_project_id")
    .notNull()
    .references(() => project.id),
  bProjectId: uuid("b_project_id")
    .notNull()
    .references(() => project.id),
  outcome: comparisonOutcome("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resultRun = pgTable("result_run", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  computedBy: uuid("computed_by").references(() => user.id),
  configSnapshot: jsonb("config_snapshot").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  notes: text("notes"),
});

export const result = pgTable(
  "result",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => resultRun.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => track.id, { onDelete: "cascade" }),
    placement: integer("placement"),
    score: numeric("score", { mode: "number" }).notNull(),
    rubricComponent: numeric("rubric_component", { mode: "number" }).notNull(),
    pairwiseComponent: numeric("pairwise_component", { mode: "number" }).notNull(),
    voteCount: integer("vote_count").notNull(),
    comparisonCount: integer("comparison_count").notNull(),
    flags: text("flags").array().notNull().default([]),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.projectId, table.trackId] }),
  ],
);

export const eventLog = pgTable("event_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  actor: jsonb("actor").notNull().default({}),
  subject: jsonb("subject").notNull().default({}),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable("outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
});

export const webhook = pgTable("webhook", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  topics: text("topics").array().notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const apiKey = pgTable("api_key", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  hashedKey: text("hashed_key").notNull(),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const membership = pgTable(
  "membership",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.orgId] })],
);

export const judgeIdentity = pgTable("judge_identity", {
  judgeId: uuid("judge_id")
    .primaryKey()
    .references(() => judge.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const loginCode = pgTable("login_code", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});
