import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { JUDGING_STATES } from "../constants";
import { hackathons, hackathonProjects } from "./hackathons";

// Room-based project judging. Projects come in from a Devpost submissions
// export or from portal submissions, are sorted into challenges, and present
// to judges seated in rooms on a generated schedule. Every table hangs off a
// hackathon edition.
//
// Names are prefixed `judging_` because the older pool-dispatch tables
// (judge.ts) and the retired panel's tables share this database: `project`,
// `track`, `vote`, `judging_project` and `judge` are all taken.
//
// The API enforces every range. The CHECK constraints below repeat the ones
// a wrong number would corrupt (ratings, schedule arithmetic), so a bug or a
// hand-written UPDATE fails loudly instead of skewing results.

// One row per edition: the state machine and the switches organisers flip on
// judging day.
export const judgingConfigs = pgTable("judging_config", {
  hackathonId: uuid("hackathon_id")
    .primaryKey()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  // draft → open → closed, and closed ↔ open. Back to draft only while no
  // evaluation exists.
  state: text("state", { enum: JUDGING_STATES })
    .notNull()
    .default("draft"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  // Member judges see every scoped score, not only projects they judged.
  // Guests never do.
  showAllScores: boolean("show_all_scores").notNull().default(false),
  // Set by the first room link or the first claim. After it, a Devpost import
  // only adds projects; replacing the inventory needs typed confirmation.
  inventoryLockedAt: timestamp("inventory_locked_at", { withTimezone: true }),
  inventoryLockedById: text("inventory_locked_by_id").references(
    () => users.id,
    { onDelete: "set null" },
  ),
  groupsInitializedAt: timestamp("groups_initialized_at", { withTimezone: true }),
  // Hackers see their times and rooms only once this is on.
  itineraryPublished: boolean("itinerary_published").notNull().default(false),
  // Schedule fell over: hackers get project search, roster and feedback hide.
  emergencyMode: boolean("emergency_mode").notNull().default(false),
  claimsStartedAt: timestamp("claims_started_at", { withTimezone: true }),
  // While judging runs, presentations of a judge who left or went quiet move
  // to judges who are here.
  autoRebalance: boolean("auto_rebalance").notNull().default(true),
  // Late-push check (judging_repo_check): while on, each entry's GitHub repo is
  // checked for pushes after the submission deadline plus this grace. The run
  // time is claimed in the row so only one instance starts a run per interval.
  repoCheckEnabled: boolean("repo_check_enabled").notNull().default(false),
  repoCheckGraceMinutes: integer("repo_check_grace_minutes")
    .notNull()
    .default(0),
  repoCheckLastRunAt: timestamp("repo_check_last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// A judged project. `source` says where it came from: a Devpost export row
// (keyed by its normalised submission URL) or a portal submission (keyed by
// the hackathon_project it was promoted from).
export const judgingEntries = pgTable(
  "judging_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["devpost", "portal"] }).notNull(),
    sourceProjectId: uuid("source_project_id"),
    title: text("title").notNull(),
    submissionUrl: text("submission_url"),
    description: text("description").notNull().default(""),
    // No array defaults: drizzle-kit re-diffs them on push. Every insert sets them.
    demoLinks: text("demo_links").array().notNull(),
    videoUrl: text("video_url"),
    technologies: text("technologies").array().notNull(),
    universities: text("universities").array().notNull(),
    prizeCategories: text("prize_categories").array().notNull(),
    participantCount: integer("participant_count").notNull().default(1),
    projectCreatedAt: timestamp("project_created_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Soft delete: evaluations and deliberation notes keep pointing at it.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: text("deleted_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // An organiser pulled this entry from prizes, usually after a check-in rule
    // break. Judges still score it, so nothing about the room schedule changes;
    // only placements and results leave it out.
    prizeIneligibleAt: timestamp("prize_ineligible_at", { withTimezone: true }),
    prizeIneligibleById: text("prize_ineligible_by_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("judging_entry_hackathon_idx").on(table.hackathonId),
    // Re-importing the same export must find the rows it already wrote.
    uniqueIndex("judging_entry_submission_url_idx")
      .on(table.hackathonId, table.submissionUrl)
      .where(sql`${table.submissionUrl} is not null`),
    // Promoting portal submissions is re-run as late ones land.
    uniqueIndex("judging_entry_source_project_idx")
      .on(table.hackathonId, table.sourceProjectId)
      .where(sql`${table.sourceProjectId} is not null`),
    foreignKey({
      name: "judging_entry_source_project_fk",
      columns: [table.sourceProjectId],
      foreignColumns: [hackathonProjects.id],
    }).onDelete("set null"),
  ],
);

// A person on a project. Devpost rows carry a name and email; claiming links
// the row to a portal user. Portal submissions are linked when promoted.
export const judgingEntryMembers = pgTable(
  "judging_entry_member",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // Set when a claimed teammate added this person, rather than Devpost.
    invitedById: text("invited_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("judging_entry_member_entry_idx").on(table.entryId),
    index("judging_entry_member_email_idx").on(table.hackathonId, table.email),
    // One project per person per edition.
    uniqueIndex("judging_entry_member_user_idx")
      .on(table.hackathonId, table.userId)
      .where(sql`${table.userId} is not null`),
  ],
);

// What GitHub says about an entry's repo: when it was last pushed to and, if
// that was after the deadline, the commits and pushes that came with it. Only
// ever flags; `decision` is the organiser's. `removedEntry` records that
// disqualifying took the project out of judging, so reinstating knows to put
// it back.
export const judgingRepoChecks = pgTable(
  "judging_repo_check",
  {
    entryId: uuid("entry_id")
      .primaryKey()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    repoOwner: text("repo_owner"),
    repoName: text("repo_name"),
    outcome: text("outcome", {
      enum: ["ok", "late", "no_repo", "unreadable", "error"],
    }).notNull(),
    // GitHub's own clock for the last push to any branch.
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    // At most 20 commits and 20 pushes; shown for context, never decided on.
    evidence: jsonb("evidence").$type<{
      commits: {
        sha: string;
        message: string;
        author: string | null;
        committedAt: string | null;
        url: string;
      }[];
      pushes: { at: string; ref: string | null; pusher: string | null }[];
    }>(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    decision: text("decision", {
      enum: ["pending", "disqualified", "cleared"],
    })
      .notNull()
      .default("pending"),
    decidedById: text("decided_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
    removedEntry: boolean("removed_entry").notNull().default(false),
    // The `deletedAt` the disqualification set, so reinstating undoes only
    // that removal and not a later manual one.
    removedDeletedAt: timestamp("removed_deleted_at", { withTimezone: true }),
    // Every repo checked for the entry (at most 3); the columns above describe
    // the one that decided the outcome.
    repos: jsonb("repos").$type<
      {
        owner: string;
        repo: string;
        outcome: "ok" | "late" | "unreadable" | "error";
        pushedAt: string | null;
        evidence: {
          commits: {
            sha: string;
            message: string;
            author: string | null;
            committedAt: string | null;
            url: string;
          }[];
          pushes: { at: string; ref: string | null; pusher: string | null }[];
        } | null;
      }[]
    >(),
    // How the latest attempt went. A flag raised by an earlier attempt is kept
    // when a later one cannot look (a repo made private), so this is shown
    // beside it.
    lastOutcome: text("last_outcome", {
      enum: ["ok", "late", "no_repo", "unreadable", "error"],
    }),
  },
  (table) => [index("judging_repo_check_hackathon_idx").on(table.hackathonId)],
);

// A one-time claim link for a member whose Devpost email is not the address
// they sign in with. The token is cleared when used.
export const judgingClaimLinks = pgTable(
  "judging_claim_link",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => judgingEntryMembers.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    token: text("token"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedById: text("consumed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("judging_claim_link_member_idx").on(table.memberId),
    uniqueIndex("judging_claim_link_token_idx")
      .on(table.token)
      .where(sql`${table.token} is not null`),
  ],
);

// A prize a project is judged for. Groups hold children (the "MLH Challenges"
// group collects every imported MLH label); a child inherits its group's mode.
// `isGeneral` means every project is in it whether or not they opted in.
export const judgingChallenges = pgTable(
  "judging_challenge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    parentId: uuid("parent_id"),
    isGroup: boolean("is_group").notNull().default(false),
    // New imported labels containing this text (case-insensitive) are filed
    // under this group.
    importLabelMatch: text("import_label_match"),
    isGeneral: boolean("is_general").notNull().default(false),
    // scheduled: timed appointments in rooms. unscheduled: judged in rooms,
    // untimed. remote: untimed and hidden from hackers.
    mode: text("mode", { enum: ["scheduled", "unscheduled", "remote"] })
      .notNull()
      .default("scheduled"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("judging_challenge_hackathon_idx").on(table.hackathonId),
    // The API trims labels and matches them case-insensitively before insert.
    // Plain columns, since an expression index re-diffs on every push.
    uniqueIndex("judging_challenge_label_idx").on(
      table.hackathonId,
      table.label,
      table.isGroup,
    ),
    foreignKey({
      name: "judging_challenge_parent_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  ],
);

// Which challenges a project is judged in. `isOptIn` is false for rows derived
// from a parent group or a general challenge.
export const judgingEntryChallenges = pgTable(
  "judging_entry_challenge",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id").notNull(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    isOptIn: boolean("is_opt_in").notNull().default(true),
  },
  (table) => [
    // Declared in the order drizzle-kit reads it back (constraint_column_usage,
    // which lists columns by name), under the name the key already has. Written
    // entry-first, push saw a different key on every deploy and dropped and
    // re-added it. The key in the database stays (entry_id, challenge_id).
    primaryKey({
      name: "judging_entry_challenge_entry_id_challenge_id_pk",
      columns: [table.challengeId, table.entryId],
    }),
    index("judging_entry_challenge_challenge_idx").on(table.challengeId),
    foreignKey({
      name: "judging_entry_challenge_challenge_fk",
      columns: [table.challengeId],
      foreignColumns: [judgingChallenges.id],
    }).onDelete("cascade"),
  ],
);

export const judgingBuildings = pgTable(
  "judging_building",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("judging_building_name_idx").on(table.hackathonId, table.name),
  ],
);

// What a judging station is. A room has its own door; a table is one of the
// numbered tables in a hall (a building), where judges sit and teams come to
// them at their slot. Both are judged and scheduled the same way.
export const judgingRoomKinds = ["room", "table"] as const;
export type JudgingRoomKind = (typeof judgingRoomKinds)[number];

// A room or table judges sit at. Each serves one root challenge (or group).
export const judgingRooms = pgTable(
  "judging_room",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => judgingChallenges.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id").references(() => judgingBuildings.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    kind: text("kind", { enum: judgingRoomKinds }).notNull().default("room"),
    displayOrder: integer("display_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("judging_room_hackathon_idx").on(table.hackathonId),
    uniqueIndex("judging_room_name_idx")
      .on(table.hackathonId, table.buildingId, table.name)
      .where(sql`${table.archivedAt} is null`),
  ],
);

// The QR code taped to a room's door. Scanning it seats a signed-in judge in
// the room, or starts a guest session for someone with no account. One live
// link per room; revoking it ends every guest session it started.
export const judgingRoomLinks = pgTable(
  "judging_room_link",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => judgingRooms.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: text("revoked_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("judging_room_link_active_idx")
      .on(table.roomId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

// Somebody judging. A member judge is a portal user (an approved `judge` row
// or staff); a guest came in through a room link and typed a name.
export const judgingJudges = pgTable(
  "judging_judge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["member", "guest"] }).notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("judging_judge_hackathon_idx").on(table.hackathonId),
    uniqueIndex("judging_judge_member_idx")
      .on(table.hackathonId, table.userId)
      .where(sql`${table.kind} = 'member'`),
  ],
);

// A guest's browser. The cookie holds 32 random bytes; only their sha256 is
// stored. `judgeId` is set once the guest gives a name.
export const judgingGuestSessions = pgTable(
  "judging_guest_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => judgingRoomLinks.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => judgingRooms.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id").references(() => judgingJudges.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("judging_guest_session_token_idx").on(table.tokenHash),
    index("judging_guest_session_link_idx").on(table.linkId),
  ],
);

// Which room a judge is sitting in right now. One open row per judge.
export const judgingPresence = pgTable(
  "judging_presence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judgingJudges.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => judgingRooms.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("judging_presence_open_idx")
      .on(table.judgeId)
      .where(sql`${table.leftAt} is null`),
    index("judging_presence_room_idx").on(table.roomId),
  ],
);

// The saved schedule for an edition: its window and the slot arithmetic.
// One slot = setup + judging + teardown minutes.
export const judgingSchedules = pgTable(
  "judging_schedule",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    setupMinutes: integer("setup_minutes").notNull().default(2),
    judgingMinutes: integer("judging_minutes").notNull().default(6),
    teardownMinutes: integer("teardown_minutes").notNull().default(2),
    sameBuildingBreakMinutes: integer("same_building_break_minutes")
      .notNull()
      .default(10),
    crossBuildingBreakMinutes: integer("cross_building_break_minutes")
      .notNull()
      .default(20),
    // Saved from a relaxed solve, where cross-building walks got only the
    // same-building break. An organiser had to say yes to that.
    reducedBreaksAcknowledgedAt: timestamp("reduced_breaks_acknowledged_at", { withTimezone: true }),
    // The first submitted evaluation. After it the schedule cannot be dropped.
    firstResultAt: timestamp("first_result_at", { withTimezone: true }),
    // The last time judges were re-balanced on their own, and how many
    // presentations that moved.
    lastRebalancedAt: timestamp("last_rebalanced_at", { withTimezone: true }),
    lastRebalanceChanged: integer("last_rebalance_changed").notNull().default(0),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("judging_schedule_hackathon_idx").on(table.hackathonId),
    check("judging_schedule_window_check", sql`${table.windowEnd} > ${table.windowStart}`),
    check(
      "judging_schedule_minutes_check",
      sql`least(${table.setupMinutes}, ${table.judgingMinutes}, ${table.teardownMinutes}, ${table.sameBuildingBreakMinutes}, ${table.crossBuildingBreakMinutes}) >= 0`,
    ),
  ],
);

// One presentation: a project, for one challenge, in one room, at one time.
// deadlineAt = startsAt + setup + judging; endsAt = startsAt + slot length.
export const judgingAppointments = pgTable(
  "judging_appointment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => judgingSchedules.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id").notNull(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => judgingRooms.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    // Compare-and-swap for moves made from two organiser screens at once.
    revision: integer("revision").notNull().default(0),
    // The one judge who grades this presentation. Null until judges are
    // assigned, and again if that judge is removed.
    assignedJudgeId: uuid("assigned_judge_id").references(
      () => judgingJudges.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    uniqueIndex("judging_appointment_task_idx").on(
      table.scheduleId,
      table.entryId,
      table.challengeId,
    ),
    uniqueIndex("judging_appointment_room_slot_idx").on(
      table.scheduleId,
      table.roomId,
      table.startsAt,
    ),
    index("judging_appointment_entry_idx").on(table.entryId),
    index("judging_appointment_judge_idx").on(table.assignedJudgeId),
    check(
      "judging_appointment_times_check",
      sql`${table.startsAt} <= ${table.deadlineAt} and ${table.deadlineAt} <= ${table.endsAt}`,
    ),
    foreignKey({
      name: "judging_appointment_challenge_fk",
      columns: [table.challengeId],
      foreignColumns: [judgingChallenges.id],
    }).onDelete("cascade"),
  ],
);

// A message pinned to every judge's screen, or to one room's. One current
// (uncleared) message globally and one per room.
export const judgingAnnouncements = pgTable(
  "judging_announcement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => judgingRooms.id, {
      onDelete: "cascade",
    }),
    message: text("message").notNull(),
    includeGuests: boolean("include_guests").notNull().default(true),
    isUrgent: boolean("is_urgent").notNull().default(false),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("judging_announcement_global_idx")
      .on(table.hackathonId)
      .where(sql`${table.roomId} is null and ${table.clearedAt} is null`),
    uniqueIndex("judging_announcement_room_idx")
      .on(table.roomId)
      .where(sql`${table.roomId} is not null and ${table.clearedAt} is null`),
  ],
);

// The rubric. Ratings are 1–5 and always required. A short response has a
// visibility per judge kind: public (shown to the team), optional (the judge
// chooses), private (organisers only). Member responses are always public.
export const judgingRubricItems = pgTable(
  "judging_rubric_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["rating", "response"] }).notNull(),
    label: text("label").notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    required: boolean("required").notNull().default(true),
    memberVisibility: text("member_visibility", {
      enum: ["public", "optional", "private"],
    }),
    guestVisibility: text("guest_visibility", {
      enum: ["public", "optional", "private"],
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("judging_rubric_item_hackathon_idx").on(table.hackathonId)],
);

// A judge's submitted verdict on one project for one challenge. Editable while
// judging is open; every save writes a revision.
export const judgingEvaluations = pgTable(
  "judging_evaluation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judgingJudges.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id").notNull(),
    appointmentId: uuid("appointment_id"),
    isComplete: boolean("is_complete").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    // Set when a draft ran past its deadline and was submitted for the judge.
    autoSubmittedAt: timestamp("auto_submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("judging_evaluation_task_idx").on(
      table.judgeId,
      table.entryId,
      table.challengeId,
    ),
    index("judging_evaluation_entry_idx").on(table.entryId, table.challengeId),
    index("judging_evaluation_hackathon_idx").on(table.hackathonId),
    foreignKey({
      name: "judging_evaluation_challenge_fk",
      columns: [table.challengeId],
      foreignColumns: [judgingChallenges.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "judging_evaluation_appointment_fk",
      columns: [table.appointmentId],
      foreignColumns: [judgingAppointments.id],
    }).onDelete("set null"),
  ],
);

export type JudgingDraftRatings = Record<string, number>;
export type JudgingDraftResponses = Record<
  string,
  { value: string; isPublic: boolean }
>;

// Autosaved answers in progress. When `deadlineAt` passes, the next read
// submits it for the judge.
export const judgingEvaluationDrafts = pgTable(
  "judging_evaluation_draft",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judgingJudges.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id").notNull(),
    appointmentId: uuid("appointment_id"),
    ratings: jsonb("ratings").$type<JudgingDraftRatings>().notNull(),
    responses: jsonb("responses").$type<JudgingDraftResponses>().notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("judging_evaluation_draft_task_idx").on(
      table.judgeId,
      table.entryId,
      table.challengeId,
    ),
    index("judging_evaluation_draft_deadline_idx")
      .on(table.hackathonId, table.deadlineAt)
      .where(sql`${table.deadlineAt} is not null`),
    foreignKey({
      name: "judging_eval_draft_challenge_fk",
      columns: [table.challengeId],
      foreignColumns: [judgingChallenges.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "judging_eval_draft_appointment_fk",
      columns: [table.appointmentId],
      foreignColumns: [judgingAppointments.id],
    }).onDelete("set null"),
  ],
);

export const judgingEvaluationRatings = pgTable(
  "judging_evaluation_rating",
  {
    evaluationId: uuid("evaluation_id").notNull(),
    itemId: uuid("item_id").notNull(),
    // 1–5.
    value: integer("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.evaluationId, table.itemId] }),
    check("judging_eval_rating_value_check", sql`${table.value} between 1 and 5`),
    foreignKey({
      name: "judging_eval_rating_evaluation_fk",
      columns: [table.evaluationId],
      foreignColumns: [judgingEvaluations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "judging_eval_rating_item_fk",
      columns: [table.itemId],
      foreignColumns: [judgingRubricItems.id],
    }).onDelete("cascade"),
  ],
);

export const judgingEvaluationResponses = pgTable(
  "judging_evaluation_response",
  {
    evaluationId: uuid("evaluation_id").notNull(),
    itemId: uuid("item_id").notNull(),
    value: text("value").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.evaluationId, table.itemId] }),
    foreignKey({
      name: "judging_eval_response_evaluation_fk",
      columns: [table.evaluationId],
      foreignColumns: [judgingEvaluations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "judging_eval_response_item_fk",
      columns: [table.itemId],
      foreignColumns: [judgingRubricItems.id],
    }).onDelete("cascade"),
  ],
);

export type JudgingEvaluationSnapshot = {
  ratings: JudgingDraftRatings;
  responses: JudgingDraftResponses;
  isComplete: boolean;
  auto: boolean;
};

// Every save of an evaluation, for the organisers' audit view.
export const judgingEvaluationRevisions = pgTable(
  "judging_evaluation_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id").notNull(),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").$type<JudgingEvaluationSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("judging_evaluation_revision_eval_idx").on(table.evaluationId),
    foreignKey({
      name: "judging_eval_revision_evaluation_fk",
      columns: [table.evaluationId],
      foreignColumns: [judgingEvaluations.id],
    }).onDelete("cascade"),
  ],
);

// A judge's private shortlist, in sections they name and order.
export const judgingDeliberationSections = pgTable(
  "judging_deliberation_section",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judgingJudges.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("judging_deliberation_section_judge_idx").on(table.judgeId)],
);

export const judgingDeliberationEntries = pgTable(
  "judging_deliberation_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionId: uuid("section_id").notNull(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("judging_deliberation_entry_idx").on(
      table.sectionId,
      table.entryId,
    ),
    foreignKey({
      name: "judging_deliberation_entry_section_fk",
      columns: [table.sectionId],
      foreignColumns: [judgingDeliberationSections.id],
    }).onDelete("cascade"),
  ],
);

// Published placings. `scope` is "overall" or a challenge id. A text key
// rather than a nullable challenge column, because Postgres treats NULLs as
// distinct and the unique index would stop holding for the overall ranking.
export const judgingPlacements = pgTable(
  "judging_placement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => judgingEntries.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("overall"),
    scopeLabel: text("scope_label").notNull().default("Overall"),
    placement: integer("placement").notNull(),
    // Calibrated for judge bias: what the placing is ranked on.
    score: numeric("score", { precision: 4, scale: 2 }),
    // The plain mean of the same evaluations. Null on rows computed before
    // calibration existed.
    rawScore: numeric("raw_score", { precision: 4, scale: 2 }),
    evaluationCount: integer("evaluation_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Leads with hackathon_id, so it also serves the by-edition reads.
    uniqueIndex("judging_placement_unique_idx").on(
      table.hackathonId,
      table.scope,
      table.entryId,
    ),
  ],
);
