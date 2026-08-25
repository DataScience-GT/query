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
    // `announced` is the gap between hidden and open: the edition is public and
    // collects interest, but takes no registrations and is NOT the edition
    // memberships attach to. See PRE_CURRENT_STATUSES below.
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
    // Every admin link builds its URL from the name, and getById resolves a
    // non-uuid argument on this column — two editions sharing a name make one
    // permanently unreachable through the admin UI, with no error.
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
    // thousands of round trips and can die halfway; without a per-row marker the
    // only safe retry is none, and the unsafe one mails everybody twice.
    acceptanceEmailSentAt: timestamp("acceptance_email_sent_at"),
    // Which acceptance wave took this applicant, 1-based. Null while pending, and
    // null forever for anyone accepted one at a time from the table.
    acceptanceWave: integer("acceptance_wave"),

    registeredAt: timestamp("registered_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // No standalone hackathon_id index: it leads both the composite below and
    // unique_participant_per_hackathon, so a lookup by hackathon already has two
    // to choose from. A third only made every insert write another entry.
    index("participant_user_id_idx").on(table.userId),
    index("participant_team_id_idx").on(table.teamId),
    // syncCurrentParticipants filters on the first two columns after every
    // approve and check-in. registered_at is here for ordering, not filtering:
    // acceptWave takes the oldest pending and the attendee list pages
    // newest-first, so without it both read every matching row and sort.
    index("participant_hackathon_status_idx").on(
      table.hackathonId,
      table.registrationStatus,
      table.registeredAt,
    ),
    // One registration per user per hackathon at the DB level, so duplicates
    // cannot race past the findFirst inside the transaction.
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
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
    registrationOpenEmailSentAt: timestamp("registration_open_email_sent_at"),
    /** Same claim mechanism as the announcement recipients above. */
    registrationOpenEmailClaimedAt: timestamp(
      "registration_open_email_claimed_at",
    ),
    // Set when the provider rejected this address, so a retry can tell a
    // never-attempted recipient from a failed one, and a permanently bad address
    // cannot keep the send reporting itself unfinished.
    registrationOpenEmailFailedAt: timestamp(
      "registration_open_email_failed_at",
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // hackathon_id alone leads unique_interest_per_hackathon below, which already
    // serves every by-edition read.
    index("hackathon_interest_user_id_idx").on(table.userId),
    // Registering interest twice is one person changing their answers. The unique
    // index is what makes the upsert in registerInterest safe against a double
    // submit.
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
    // Named explicitly: the generated name is 67 chars, Postgres truncates to 63,
    // and drizzle then sees a diff on every push and re-creates it forever.
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
    claimedAt: timestamp("claimed_at"),
    sentAt: timestamp("sent_at"),
    // Set when the provider rejected this address, so a retry can tell a
    // never-attempted recipient from a failed one.
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
