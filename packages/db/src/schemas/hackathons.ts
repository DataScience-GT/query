import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  json,
  jsonb,
  index,
  unique,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { members } from "./members";
import {
  CHECK_IN_METHODS,
  HACKATHON_STATUSES,
  LEVELS_OF_STUDY,
  PARTICIPANT_STATUSES,
  REFERRAL_SOURCES,
  SHIRT_SIZES,
  TRAVEL_DISTANCES,
  TRAVEL_METHODS,
  YES_NO_PREFER_NOT,
} from "../constants";

// Hackathon events
export const hackathons = pgTable(
  "hackathon",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    location: text("location"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    registrationDeadline: timestamp("registration_deadline", { withTimezone: true }),
    hackingStartTime: timestamp("hacking_start_time", { withTimezone: true }),
    // Seats taken are the approved and checked-in participant rows
    // (services/derived-counts.ts in the api), not a stored column.
    maxParticipants: integer("max_participants"),
    // `announced` is the gap between hidden and open: the edition is public and
    // collects interest, but takes no registrations and is NOT the edition
    // memberships attach to. See PRE_CURRENT_STATUSES below.
    status: text("status", {
      enum: HACKATHON_STATUSES,
    })
      .notNull()
      .default("draft"),
    prizes:
      json("prizes").$type<
        { place: string; amount: number; description?: string }[]
      >(),
    rules: text("rules"),
    theme: text("theme"),
    tracks: text("tracks").array(),
    challenges: text("challenges").array(),
    websiteUrl: text("website_url"),
    isPublic: boolean("is_public").notNull().default(true),
    judgingActive: boolean("judging_active").notNull().default(false),
    // Point store. Hidden and closed until an organiser opens it; the location
    // is where hackers pick up what they bought.
    storeCatalogVisible: boolean("store_catalog_visible")
      .notNull()
      .default(false),
    storeOpen: boolean("store_open").notNull().default(false),
    storeLocation: text("store_location"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hackathon_status_idx").on(table.status),
    // Every admin link builds its URL from the name, and getById resolves a
    // non-uuid argument on this column — two editions sharing a name make one
    // permanently unreachable through the admin UI, with no error.
    unique("unique_hackathon_name").on(table.name),
    check("hackathon_dates_check", sql`${table.endDate} >= ${table.startDate}`),
    check("hackathon_max_participants_check", sql`${table.maxParticipants} > 0`),
  ],
);

// Teams for hackathons
export const hackathonTeams = pgTable(
  "hackathon_team",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // The roster is the participant rows with this team_id, not a stored count.
    maxMembers: integer("max_members").notNull().default(4),
    captainId: text("captain_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isOpen: boolean("is_open").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("team_hackathon_id_idx").on(table.hackathonId),
    index("team_captain_id_idx").on(table.captainId),
    check("team_max_members_check", sql`${table.maxMembers} > 0`),
  ],
);

// Individual participants
export const hackathonParticipants = pgTable(
  "hackathon_participant",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "set null",
    }),

    // Registration info
    registrationStatus: text("registration_status", {
      enum: PARTICIPANT_STATUSES,
    })
      .notNull()
      .default("pending"),

    // Team info (optional, participant can be solo)
    teamId: uuid("team_id").references(() => hackathonTeams.id, {
      onDelete: "set null",
    }),

    // Personal info
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    age: integer("age"),
    gender: text("gender"),
    pronouns: text("pronouns"),
    race: text("race"),
    underrepresented: boolean("underrepresented").default(false),

    // Academic info
    school: text("school"),
    major: text("major"),
    firstGeneration: boolean("first_generation").default(false),
    graduationYear: integer("graduation_year"),
    levelOfStudy: text("level_of_study", {
      enum: LEVELS_OF_STUDY,
    }),
    country: text("country"),

    // Experience
    hackathonsAttended: integer("hackathons_attended"),
    resumeUrl: text("resume_url"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    whyAttend: text("why_attend"),

    // Logistics
    shirtSize: text("shirt_size", { enum: SHIRT_SIZES }),
    dietaryRestrictions: text("dietary_restrictions").array(),
    emergencyContact: text("emergency_contact"),
    emergencyPhone: text("emergency_phone"),
    needsHardware: boolean("needs_hardware").default(false),

    // Application answers added for the 2027 form. All nullable: rows from
    // before it never saw these questions.
    isGtStudent: boolean("is_gt_student"),
    isDsgtMember: boolean("is_dsgt_member"),
    attendedHacklyticsBefore: boolean("attended_hacklytics_before"),
    usCitizen: text("us_citizen", { enum: YES_NO_PREFER_NOT }),
    travelReimbursement: boolean("travel_reimbursement"),
    travelFromCity: text("travel_from_city"),
    travelFromState: text("travel_from_state"),
    travelFromCountry: text("travel_from_country"),
    travelDistance: text("travel_distance", { enum: TRAVEL_DISTANCES }),
    travelMethod: text("travel_method", { enum: TRAVEL_METHODS }),
    techJourney: text("tech_journey"),
    helpfulFeedback: text("helpful_feedback"),
    trackInterest: text("track_interest"),
    dreamBuild: text("dream_build"),
    referralSource: text("referral_source", { enum: REFERRAL_SOURCES }),
    ramadanFasting: text("ramadan_fasting", { enum: YES_NO_PREFER_NOT }),
    anythingElse: text("anything_else"),
    favoriteFlower: text("favorite_flower"),
    favoriteSnack: text("favorite_snack"),
    excitement: integer("excitement"),

    // Consent
    agreeToCodeOfConduct: boolean("agree_to_code_of_conduct").default(false),
    mlhCodeOfConduct: boolean("mlh_code_of_conduct").default(false),
    mlhDataSharing: boolean("mlh_data_sharing").default(false),
    mlhInformationalEmails: boolean("mlh_informational_emails").default(false),

    // Participation tracking
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    // Set when an accepted hacker says they are coming. Null means no answer,
    // which is what organisers chase to free seats before the event.
    attendanceConfirmedAt: timestamp("attendance_confirmed_at", { withTimezone: true }),
    hasSubmittedProject: boolean("has_submitted_project")
      .notNull()
      .default(false),
    // Stamped per participant as their acceptance mail leaves. A mass send is
    // thousands of round trips and can die halfway; without a per-row marker the
    // only safe retry is none, and the unsafe one mails everybody twice.
    acceptanceEmailSentAt: timestamp("acceptance_email_sent_at", { withTimezone: true }),
    // Which acceptance wave took this applicant, 1-based. Null while pending, and
    // null forever for anyone accepted one at a time from the table.
    acceptanceWave: integer("acceptance_wave"),

    // Discord link. The account is only ever the id and username Discord gave
    // us; the access token is never stored. foodGroup is a key from
    // FOOD_GROUPS (packages/api/src/services/discord/config.ts), not a name,
    // so the list can change without a migration.
    discordUserId: text("discord_user_id"),
    discordUsername: text("discord_username"),
    discordLinkedAt: timestamp("discord_linked_at", { withTimezone: true }),
    foodGroup: text("food_group"),
    ramadanRoleOptIn: boolean("ramadan_role_opt_in"),

    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // No standalone hackathon_id index: it leads both the composite below and
    // hackathon_participant_hackathon_user_idx, so a lookup by hackathon already has two
    // to choose from. A third only made every insert write another entry.
    index("participant_user_id_idx").on(table.userId),
    index("participant_team_id_idx").on(table.teamId),
    // The seat counts (assertSeats, seatedCounts) filter on the first two
    // columns. registered_at is here for ordering, not filtering:
    // acceptWave takes the oldest pending and the attendee list pages
    // newest-first, so without it both read every matching row and sort.
    index("participant_hackathon_status_idx").on(
      table.hackathonId,
      table.registrationStatus,
      table.registeredAt,
    ),
    // One registration per user per hackathon at the DB level, so duplicates
    // cannot race past the findFirst inside the transaction.
    uniqueIndex("hackathon_participant_hackathon_user_idx").on(
      table.hackathonId,
      table.userId,
    ),
    // One Discord account links to one participant per hackathon.
    uniqueIndex("hackathon_participant_discord_idx")
      .on(table.hackathonId, table.discordUserId)
      .where(sql`${table.discordUserId} is not null`),
  ],
);

// Project submissions
export const hackathonProjects = pgTable(
  "hackathon_project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => hackathonTeams.id, {
      onDelete: "cascade",
    }),
    // Who filed it. A solo entry has no team, so without this nothing links the
    // row to its author and a resubmit cannot find the project to update.
    submittedById: uuid("submitted_by_id").references(
      () => hackathonParticipants.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    description: text("description").notNull(),
    technologies: text("technologies").array(),
    tracks: text("tracks").array(), // Enum: Sports, Entertainment, Finance, Healthcare, databricks, sphinx, growth factor, figma, actian, safety kit, GEN-AI, CYBER, NONE
    challenges: text("challenges").array(), // Enum: AGG, ASSURANT, AWS, CAPONE, GROWTH, MLH_MONGODB, MLH_STREAMLIT, MLH_TECH, MLH_CLOUDFLARE, MLH_REACH_CAPITAL
    isCreateX: boolean("is_create_x").default(false),
    teamMembers: text("team_members").array(), // Store names/emails if not fully linked
    githubUrl: text("github_url"),
    demoUrl: text("demo_url"),
    videoUrl: text("video_url"),
    slides: text("slides"),
    status: text("status", {
      enum: ["draft", "submitted", "judging", "winner"],
    })
      .notNull()
      .default("draft"),
    score: integer("score"),
    ranking: integer("ranking"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Set when an organiser pulls the project. A team's own withdrawal leaves
    // it null, which is how submitProject tells the two drafts apart.
    withdrawnByAdminAt: timestamp("withdrawn_by_admin_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_hackathon_id_idx").on(table.hackathonId),
    index("project_team_id_idx").on(table.teamId),
    index("project_status_idx").on(table.status),
    // One solo entry per person per hackathon, enforced where two concurrent
    // submits would both insert. Solo rows only, so a captain filing for their
    // team is unaffected.
    uniqueIndex("project_solo_submitter_idx")
      .on(table.hackathonId, table.submittedById)
      .where(sql`${table.teamId} is null`),
    // The team half of the same rule. submitProject decides insert-vs-update from
    // a read, so two concurrent submits by a captain would both insert.
    uniqueIndex("project_team_submission_idx")
      .on(table.hackathonId, table.teamId)
      .where(sql`${table.teamId} is not null`),
  ],
);

// Editions that exist but are not yet current. resolveCurrentHackathonId
// skips these, which is what lets staff announce next year months ahead
// without every membership and portal gate retargeting an edition nobody
// registered for. An edition becomes current when it moves to `open`.
export const PRE_CURRENT_STATUSES = ["draft", "announced"] as const;

// "Tell me when registration opens." Sign-in is required rather than a typed
// address, so an entry is a real user row with a verified email and converts
// into a participant without re-entering anything — not a Georgia Tech gate,
// since the email-code provider takes any address. The fields here shape
// pre-event planning; the rest is asked at registration. `country` earns its
// place for travel, visas and time zones. All optional.
export const hackathonInterest = pgTable(
  "hackathon_interest",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    school: text("school"),
    country: text("country"),
    graduationYear: integer("graduation_year"),
    experience: text("experience", {
      enum: ["first", "one_or_two", "three_plus"],
    }),
    // When this person was told registration opened. That one message is the
    // whole reason the list exists, and a send of thousands runs in batches from
    // an admin's browser — so it has to be resumable per recipient, exactly like
    // acceptanceEmailSentAt.
    registrationOpenEmailSentAt: timestamp("registration_open_email_sent_at", { withTimezone: true }),
    /** Same claim mechanism as the announcement recipients above. */
    registrationOpenEmailClaimedAt: timestamp("registration_open_email_claimed_at", {
      withTimezone: true,
    }),
    // Set when the provider rejected this address, so a retry can tell a
    // never-attempted recipient from a failed one, and a permanently bad address
    // cannot keep the send reporting itself unfinished.
    registrationOpenEmailFailedAt: timestamp("registration_open_email_failed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // hackathon_id alone leads hackathon_interest_hackathon_user_idx below, which already
    // serves every by-edition read.
    index("hackathon_interest_user_id_idx").on(table.userId),
    // Registering interest twice is one person changing their answers. The unique
    // index is what makes the upsert in registerInterest safe against a double
    // submit.
    uniqueIndex("hackathon_interest_hackathon_user_idx").on(table.hackathonId, table.userId),
  ],
);

export type HackathonInterest = typeof hackathonInterest.$inferSelect;

// An application someone started and has not submitted. Kept on the server so
// it follows them to another device, and so the reminder job knows who began
// and stopped. `data` is the form's own answers as typed (strings and chips),
// not the submit shape, and never holds what the form keeps out of any saved
// draft: citizenship, fasting, the consents, or the resume file. Registering
// deletes the row. `reminderSentAt` is the claim the reminder takes before it
// mails, so one draft is mailed at most once however many runs overlap, and a
// later edit does not reset it.
export const hackathonApplicationDrafts = pgTable(
  "hackathon_application_draft",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  },
  (table) => [
    // One draft per person per edition. It is also what makes the autosave
    // upsert safe when two tabs save at once.
    uniqueIndex("hackathon_application_draft_user_hackathon_idx").on(
      table.userId,
      table.hackathonId,
    ),
  ],
);

export type HackathonApplicationDraft =
  typeof hackathonApplicationDrafts.$inferSelect;

// Event scheduling for hackathons
export const hackathonEvents = pgTable(
  "hackathon_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type", {
      enum: ["workshop", "meal", "ceremony", "activity", "sponsor_session"],
    }).notNull(),
    location: text("location").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    // What attending is worth. Copied onto each attendance row at check-in, so
    // editing it later never changes what anyone already earned.
    points: integer("points").notNull().default(0),
    // A short code shown at the event (on screen, or as a QR that opens the
    // portal with it filled in). Hackers type or scan it themselves, so nobody
    // has to hold up a pass. Only accepted while selfCheckIn is on and the
    // event is running.
    checkInCode: text("check_in_code"),
    selfCheckIn: boolean("self_check_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("event_hackathon_id_idx").on(table.hackathonId),
    index("event_type_idx").on(table.type),
    uniqueIndex("event_check_in_code_idx")
      .on(table.hackathonId, table.checkInCode)
      .where(sql`${table.checkInCode} is not null`),
    check("hackathon_event_times_check", sql`${table.endTime} >= ${table.startTime}`),
    check("hackathon_event_points_check", sql`${table.points} >= 0`),
  ],
);

// QR Check-ins for events
export const hackathonEventAttendees = pgTable(
  "hackathon_event_attendee",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => hackathonEvents.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).defaultNow().notNull(),
    // The event's points at the moment of check-in. Null on rows from before
    // points existed, which count as zero. No default on purpose: every writer
    // must copy the event's value, or the number is invented.
    pointsAwarded: integer("points_awarded"),
    // scan: staff scanned the pass. code: the hacker entered the event's code.
    // manual: staff found them by name. Null on older rows.
    method: text("method", { enum: CHECK_IN_METHODS }),
    checkedInById: text("checked_in_by_id"),
  },
  (table) => [
    index("event_attendee_participant_id_idx").on(table.participantId),
    // Prevent duplicate check-ins. Leads with event_id, so it also serves the
    // by-event reads.
    uniqueIndex("event_attendee_event_participant_idx").on(table.eventId, table.participantId),
    // Named explicitly: the generated name is 67 chars, Postgres truncates to 63,
    // and drizzle then sees a diff on every push and re-creates it forever.
    foreignKey({
      name: "event_attendee_participant_id_fk",
      columns: [table.participantId],
      foreignColumns: [hackathonParticipants.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_attendee_checked_in_by_fk",
      columns: [table.checkedInById],
      foreignColumns: [users.id],
    }).onDelete("set null"),
  ],
);

// A check-in the rules refused (two events at the same time, or two under 30
// minutes apart). The refusal itself rolls back, so this is the only trace:
// organisers read it as a flag on the hacker's team in judging and decide
// whether the team stays in the running for prizes. Never shown to hackers.
// One row per (person, event tried, event already in) with a count, so a hacker
// retrying a rejected code adds an attempt rather than a screen of duplicates.
// It points at the participant, not the project, because a person can change
// teams or have their project promoted later; judging resolves it to an entry
// when it is read.
export const hackathonCheckInFlags = pgTable(
  "hackathon_check_in_flag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    // The participant and event FKs are declared in the table extras with
    // explicit names. The generated participant one is 66 characters, past
    // Postgres's 63-char limit, and the conflict event one lands on exactly 63;
    // the event one is named to match.
    participantId: uuid("participant_id").notNull(),
    // The event they tried to enter. Cleared if the event is deleted: the flag
    // is the only record of the rule break, and prize review still needs it
    // after a session is cancelled. Always set when the flag is written.
    eventId: uuid("event_id"),
    // The event they were already in. Cleared the same way.
    conflictEventId: uuid("conflict_event_id"),
    rule: text("rule", { enum: ["overlap", "too_soon"] }).notNull(),
    method: text("method", { enum: CHECK_IN_METHODS }).notNull(),
    // The hacker on a code, staff otherwise.
    attemptedById: text("attempted_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    attempts: integer("attempts").notNull().default(1),
    // Written from the app clock, like checked_in_at, which the rule compares
    // against.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    // An organiser reviewed the flag and cleared it. It stays on record.
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedById: text("dismissed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // Nulls are distinct in a unique index, so clearing a deleted event's id
    // never makes two flags collide here.
    uniqueIndex("check_in_flag_attempt_idx").on(
      table.participantId,
      table.eventId,
      table.conflictEventId,
    ),
    index("check_in_flag_hackathon_idx").on(table.hackathonId),
    foreignKey({
      name: "check_in_flag_participant_fk",
      columns: [table.participantId],
      foreignColumns: [hackathonParticipants.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "check_in_flag_event_fk",
      columns: [table.eventId],
      foreignColumns: [hackathonEvents.id],
    }).onDelete("set null"),
    foreignKey({
      name: "check_in_flag_conflict_event_fk",
      columns: [table.conflictEventId],
      foreignColumns: [hackathonEvents.id],
    }).onDelete("set null"),
  ],
);

// One announcement, composed once and sent in batches. The send loop runs in
// an organiser's browser, 500 at a time across separate requests — without a
// stored copy of what was sent and to whom, a closed tab left only "mail
// everybody again" or "leave the rest unmailed".
export const hackathonAnnouncements = pgTable(
  "hackathon_announcement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    audience: text("audience", {
      enum: [
        "interested",
        "registered",
        "approved",
        "checked_in",
        // Rejected and waitlisted applicants, who every other audience deliberately
        // excludes. Chosen on purpose or not at all.
        "not_accepted",
        // Each half of not_accepted on its own, so a waitlist note never
        // reaches someone who was turned down.
        "waitlisted",
        "rejected",
        // Judges, not applicants: the judge roster of this edition, and the
        // part of it that never answered "can you attend in person?". Never
        // shown on hackers' event pages.
        "judges",
        "judges_in_person_unanswered",
      ],
    }).notNull(),
    subject: text("subject").notNull(),
    heading: text("heading").notNull(),
    body: text("body").notNull(),
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hackathon_announcement_hackathon_id_idx").on(table.hackathonId),
  ],
);

// The audience of one announcement, frozen at compose time, one row per
// person. Snapshotting is what makes resuming exact: re-resolving the
// audience per batch and slicing by offset meant any row that moved shifted
// everything after it — some mailed twice, others never.
export const hackathonAnnouncementRecipients = pgTable(
  "hackathon_announcement_recipient",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // The FK is declared in the table extras below with an explicit name: the one
    // drizzle generates here is 78 characters, past Postgres's 63-char limit.
    announcementId: uuid("announcement_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The address as it was at compose time, so a later change cannot cause a
    // second delivery to the same person under a new address.
    email: text("email").notNull(),
    // Claimed by a batch about to send to this address. Without it two
    // overlapping requests both select the same `sent_at IS NULL` rows and both
    // send. The claim is an atomic UPDATE, so exactly one wins each row, and a
    // claim older than CLAIM_TIMEOUT is reclaimable so a dead batch resumes.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Set when the provider rejected this address, so a retry can tell a
    // never-attempted recipient from a failed one.
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (table) => [
    index("hackathon_announcement_recipient_pending_idx").on(
      table.announcementId,
      table.sentAt,
    ),
    // One delivery per person per announcement, enforced by the database rather
    // than by the batching arithmetic that used to get it wrong.
    uniqueIndex("announcement_recipient_announcement_user_idx").on(
      table.announcementId,
      table.userId,
    ),
    // Postgres truncates identifiers past 63 characters, so the generated name
    // came back shortened while drizzle-kit compared against the full one. Every
    // `migrate:push` then dropped and recreated this constraint and reported
    // "Changes applied", so it could never say "No changes detected".
    foreignKey({
      columns: [table.announcementId],
      foreignColumns: [hackathonAnnouncements.id],
      name: "announcement_recipient_announcement_id_fk",
    }).onDelete("cascade"),
  ],
);

// People barred from taking part in hackathons: registering, the interest
// list, teams, submitting and judging. Club membership is untouched. Keyed by
// lowercased email rather than user id, so signing in again through another
// provider, or with a new account on the same address, is still refused.
// Lifting a ban deletes the row; who banned and lifted whom is in audit_logs.
export const hackathonBans = pgTable(
  "hackathon_ban",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    bannedBy: text("banned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("hackathon_ban_email_idx").on(table.email)],
);
