import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  json,
  index,
  unique,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./auth";
import { members } from "./members";

// Hackathon events
export const hackathons = pgTable(
  "hackathon",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    location: text("location"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    registrationDeadline: timestamp("registration_deadline"),
    hackingStartTime: timestamp("hacking_start_time"),
    maxParticipants: integer("max_participants"),
    currentParticipants: integer("current_participants").notNull().default(0),
    /**
     * `announced` is the gap between "nobody can see this" and "registration is
     * open": the edition exists publicly, has a landing page and collects
     * interest, but is not taking registrations and — importantly — is NOT the
     * edition memberships attach to. See PRE_CURRENT_STATUSES below.
     */
    status: text("status", {
      enum: [
        "draft",
        "announced",
        "open",
        "closed",
        "in_progress",
        "completed",
        "cancelled",
      ],
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("hackathon_status_idx").on(table.status),
    // Every admin link builds its URL from the hackathon's name, and getById
    // resolves a non-uuid argument with findFirst on this column. Two editions
    // sharing a name therefore make one of them permanently unreachable
    // through the admin UI, with no error to explain it.
    unique("unique_hackathon_name").on(table.name),
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
    maxMembers: integer("max_members").notNull().default(4),
    currentMembers: integer("current_members").notNull().default(0),
    captainId: text("captain_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isOpen: boolean("is_open").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("team_hackathon_id_idx").on(table.hackathonId),
    index("team_captain_id_idx").on(table.captainId),
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
      enum: ["pending", "approved", "rejected", "waitlisted", "checked_in"],
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
      enum: [
        "Freshman",
        "Sophomore",
        "Junior",
        "Senior",
        "Graduate",
        "PhD",
        "Other",
      ],
    }),
    country: text("country"),

    // Experience
    hackathonsAttended: integer("hackathons_attended"),
    resumeUrl: text("resume_url"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    whyAttend: text("why_attend"),

    // Logistics
    shirtSize: text("shirt_size", { enum: ["XS", "S", "M", "L", "XL", "XXL"] }),
    dietaryRestrictions: text("dietary_restrictions").array(),
    emergencyContact: text("emergency_contact"),
    emergencyPhone: text("emergency_phone"),
    needsHardware: boolean("needs_hardware").default(false),

    // Consent
    agreeToCodeOfConduct: boolean("agree_to_code_of_conduct").default(false),
    mlhCodeOfConduct: boolean("mlh_code_of_conduct").default(false),
    mlhDataSharing: boolean("mlh_data_sharing").default(false),
    mlhInformationalEmails: boolean("mlh_informational_emails").default(false),

    // Participation tracking
    checkedInAt: timestamp("checked_in_at"),
    hasSubmittedProject: boolean("has_submitted_project")
      .notNull()
      .default(false),
    // Stamped per participant as their acceptance mail leaves. A mass send is
    // thousands of SMTP round trips and can die halfway through; without a
    // per-row marker the only safe retry is none, and the unsafe one mails
    // everybody twice.
    acceptanceEmailSentAt: timestamp("acceptance_email_sent_at"),

    registeredAt: timestamp("registered_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("participant_hackathon_id_idx").on(table.hackathonId),
    index("participant_user_id_idx").on(table.userId),
    index("participant_team_id_idx").on(table.teamId),
    // syncCurrentParticipants filters on exactly this pair and runs after every
    // approve and every check-in. Without it each call is a full scan of the
    // participant table.
    index("participant_hackathon_status_idx").on(
      table.hackathonId,
      table.registrationStatus,
    ),
    // Enforce one registration per user per hackathon at the DB level.
    // This prevents duplicates even under concurrent requests that race
    // past the application-level findFirst check inside the transaction.
    unique("unique_participant_per_hackathon").on(
      table.hackathonId,
      table.userId,
    ),
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
    // row back to its author and a resubmit cannot find the project to update —
    // it either files a duplicate or gets refused outright.
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
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("project_hackathon_id_idx").on(table.hackathonId),
    index("project_team_id_idx").on(table.teamId),
    index("project_status_idx").on(table.status),
    // One solo entry per person per hackathon, enforced where two concurrent
    // submits would otherwise both insert. Restricted to solo rows so a captain
    // filing for their team is unaffected.
    uniqueIndex("project_solo_submitter_idx")
      .on(table.hackathonId, table.submittedById)
      .where(sql`${table.teamId} is null`),
    // The team half of the same rule. submitProject decides insert-vs-update
    // from a read, so two concurrent submits by a captain would otherwise both
    // insert and the team would end up with two entries.
    uniqueIndex("project_team_submission_idx")
      .on(table.hackathonId, table.teamId)
      .where(sql`${table.teamId} is not null`),
  ],
);

/**
 * Editions that exist but are not yet "the current edition".
 *
 * `resolveCurrentHackathonId` skips these, which is what lets staff announce
 * next year months ahead without every membership, portal gate and club
 * check-in silently retargeting an edition nobody has registered for. An
 * edition becomes current the moment it moves to `open`.
 */
export const PRE_CURRENT_STATUSES = ["draft", "announced"] as const;

/**
 * "Tell me when registration opens."
 *
 * Sign-in is required rather than taking a typed address: an entry is then a
 * real `user` row with a verified email behind it, so the list can actually be
 * mailed and an interested person converts into a participant without
 * re-entering anything. Sign-in is not a Georgia Tech gate — the hackathon is
 * open globally, and the email-code provider means anybody with any address can
 * do it without a Google or GitHub account.
 *
 * The fields here are the ones that shape pre-event planning; everything else
 * is asked at registration. `country` earns its place for a global field:
 * travel, visa lead time and time zones for pre-event programming all depend on
 * it, and it is far too late to ask once registration opens. All are optional —
 * a blank answer should never be the reason somebody abandons the form.
 */
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
    /**
     * When this person was told registration opened.
     *
     * The whole reason the list exists is that one message, and a send of
     * thousands runs in batches from an admin's browser — so it has to be
     * resumable. Per recipient, exactly like `acceptanceEmailSentAt`: a closed
     * tab, a refresh or a second click continues where it stopped instead of
     * mailing everybody again.
     */
    registrationOpenEmailSentAt: timestamp("registration_open_email_sent_at"),
    /** Same claim mechanism as the announcement recipients above. */
    registrationOpenEmailClaimedAt: timestamp(
      "registration_open_email_claimed_at",
    ),
    /**
     * Set when the provider rejected this address, so a retry can tell a
     * never-attempted recipient from a failed one — and so a permanently bad
     * address cannot keep the send reporting itself unfinished forever.
     */
    registrationOpenEmailFailedAt: timestamp(
      "registration_open_email_failed_at",
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("hackathon_interest_hackathon_id_idx").on(table.hackathonId),
    index("hackathon_interest_user_id_idx").on(table.userId),
    // Registering interest twice is one person changing their answers, not two
    // people. The unique index is what makes the upsert in `registerInterest`
    // safe against a double submit.
    unique("unique_interest_per_hackathon").on(table.hackathonId, table.userId),
  ],
);

export type HackathonInterest = typeof hackathonInterest.$inferSelect;

// Relations
export const hackathonsRelations = relations(hackathons, ({ many }) => ({
  participants: many(hackathonParticipants),
  teams: many(hackathonTeams),
  projects: many(hackathonProjects),
  interest: many(hackathonInterest),
}));

export const hackathonInterestRelations = relations(
  hackathonInterest,
  ({ one }) => ({
    hackathon: one(hackathons, {
      fields: [hackathonInterest.hackathonId],
      references: [hackathons.id],
    }),
    user: one(users, {
      fields: [hackathonInterest.userId],
      references: [users.id],
    }),
  }),
);

export const hackathonParticipantsRelations = relations(
  hackathonParticipants,
  ({ one }) => ({
    hackathon: one(hackathons, {
      fields: [hackathonParticipants.hackathonId],
      references: [hackathons.id],
    }),
    user: one(users, {
      fields: [hackathonParticipants.userId],
      references: [users.id],
    }),
    member: one(members, {
      fields: [hackathonParticipants.memberId],
      references: [members.id],
    }),
    team: one(hackathonTeams, {
      fields: [hackathonParticipants.teamId],
      references: [hackathonTeams.id],
    }),
  }),
);

export const hackathonTeamsRelations = relations(
  hackathonTeams,
  ({ one, many }) => ({
    hackathon: one(hackathons, {
      fields: [hackathonTeams.hackathonId],
      references: [hackathons.id],
    }),
    captain: one(users, {
      fields: [hackathonTeams.captainId],
      references: [users.id],
    }),
    participants: many(hackathonParticipants),
    projects: many(hackathonProjects),
  }),
);

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
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("event_hackathon_id_idx").on(table.hackathonId),
    index("event_type_idx").on(table.type),
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
    checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  },
  (table) => [
    index("event_attendee_event_id_idx").on(table.eventId),
    index("event_attendee_participant_id_idx").on(table.participantId),
    // Prevent duplicate check-ins
    unique("unique_event_participant").on(table.eventId, table.participantId),
    // Named explicitly: the generated name is 67 chars, Postgres truncates it
    // to 63, and drizzle then sees a diff on every push and re-creates the
    // constraint forever.
    foreignKey({
      name: "event_attendee_participant_id_fk",
      columns: [table.participantId],
      foreignColumns: [hackathonParticipants.id],
    }).onDelete("cascade"),
  ],
);

export const hackathonEventsRelations = relations(
  hackathonEvents,
  ({ one, many }) => ({
    hackathon: one(hackathons, {
      fields: [hackathonEvents.hackathonId],
      references: [hackathons.id],
    }),
    attendees: many(hackathonEventAttendees),
  }),
);

export const hackathonEventAttendeesRelations = relations(
  hackathonEventAttendees,
  ({ one }) => ({
    event: one(hackathonEvents, {
      fields: [hackathonEventAttendees.eventId],
      references: [hackathonEvents.id],
    }),
    participant: one(hackathonParticipants, {
      fields: [hackathonEventAttendees.participantId],
      references: [hackathonParticipants.id],
    }),
  }),
);

export const hackathonProjectsRelations = relations(
  hackathonProjects,
  ({ one }) => ({
    hackathon: one(hackathons, {
      fields: [hackathonProjects.hackathonId],
      references: [hackathons.id],
    }),
    team: one(hackathonTeams, {
      fields: [hackathonProjects.teamId],
      references: [hackathonTeams.id],
    }),
  }),
);

/**
 * One announcement, composed once and sent in batches.
 *
 * The send loop runs in an organiser's browser: it walks the audience 500 at a
 * time across separate requests. Without a stored copy of what was being sent
 * and to whom, a closed tab left no way to resume — the only options were
 * "mail everybody again" or "leave the rest unmailed", and nothing on any
 * screen said which recipients had already had it.
 */
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
        // Rejected and waitlisted applicants, who every other audience
        // deliberately excludes. Chosen on purpose or not at all.
        "not_accepted",
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("hackathon_announcement_hackathon_id_idx").on(table.hackathonId),
  ],
);

/**
 * The audience of one announcement, frozen at compose time, one row per person.
 *
 * Snapshotting is what makes resuming exact: the previous implementation
 * re-resolved the audience on every batch and sliced it by offset, so any row
 * that moved between requests shifted everything after it — some people were
 * mailed twice and others never at all, silently.
 */
export const hackathonAnnouncementRecipients = pgTable(
  "hackathon_announcement_recipient",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // The FK is declared in the table extras below with an explicit name: the
    // one drizzle generates here is 78 characters, past Postgres's 63-char
    // identifier limit.
    announcementId: uuid("announcement_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The address as it was at compose time, so a later change cannot cause a
     *  second delivery to the same person under a new address. */
    email: text("email").notNull(),
    /**
     * Claimed by a batch that is about to send to this address.
     *
     * Without it, two overlapping requests — two organisers, or one impatient
     * double-click — both select the same `sent_at IS NULL` rows and both
     * send. The claim is an atomic UPDATE, so exactly one request wins each
     * row. A claim older than CLAIM_TIMEOUT is reclaimable, which is what makes
     * a batch that died mid-flight resumable rather than permanently stuck.
     */
    claimedAt: timestamp("claimed_at"),
    sentAt: timestamp("sent_at"),
    /** Set when the provider rejected this address, so a retry can tell a
     *  never-attempted recipient from a failed one. */
    failedAt: timestamp("failed_at"),
  },
  (table) => [
    index("hackathon_announcement_recipient_pending_idx").on(
      table.announcementId,
      table.sentAt,
    ),
    // One delivery per person per announcement, enforced by the database rather
    // than by the batching arithmetic that used to get it wrong.
    unique("unique_announcement_recipient").on(
      table.announcementId,
      table.userId,
    ),
    // Postgres truncates any identifier past 63 characters, so the generated
    // name came back shortened while drizzle-kit went on comparing against the
    // full one. Every `migrate:push` then dropped and recreated this
    // constraint and reported "Changes applied", which is the release check
    // §7 asks for — it could never say "No changes detected".
    foreignKey({
      columns: [table.announcementId],
      foreignColumns: [hackathonAnnouncements.id],
      name: "announcement_recipient_announcement_id_fk",
    }).onDelete("cascade"),
  ],
);

export const hackathonAnnouncementsRelations = relations(
  hackathonAnnouncements,
  ({ one, many }) => ({
    hackathon: one(hackathons, {
      fields: [hackathonAnnouncements.hackathonId],
      references: [hackathons.id],
    }),
    recipients: many(hackathonAnnouncementRecipients),
  }),
);

export const hackathonAnnouncementRecipientsRelations = relations(
  hackathonAnnouncementRecipients,
  ({ one }) => ({
    announcement: one(hackathonAnnouncements, {
      fields: [hackathonAnnouncementRecipients.announcementId],
      references: [hackathonAnnouncements.id],
    }),
  }),
);
