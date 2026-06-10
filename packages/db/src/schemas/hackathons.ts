import { pgTable, text, timestamp, uuid, boolean, integer, json, index, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { members } from "./members";

// Hackathon events
export const hackathons = pgTable("hackathon", {
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
  status: text("status", { enum: ["draft", "open", "closed", "in_progress", "completed", "cancelled"] })
    .notNull()
    .default("draft"),
  prizes: json("prizes").$type<{ place: string; amount: number; description?: string }[]>(),
  rules: text("rules"),
  theme: text("theme"),
  tracks: text("tracks").array(),
  challenges: text("challenges").array(),
  websiteUrl: text("website_url"),
  isPublic: boolean("is_public").notNull().default(true),
  judgingActive: boolean("judging_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("hackathon_status_idx").on(table.status),
]);

// Teams for hackathons
export const hackathonTeams = pgTable("hackathon_team", {
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
}, (table) => [
  index("team_hackathon_id_idx").on(table.hackathonId),
  index("team_captain_id_idx").on(table.captainId),
]);

// Individual participants
export const hackathonParticipants = pgTable("hackathon_participant", {
  id: uuid("id").defaultRandom().primaryKey(),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .references(() => members.id, { onDelete: "set null" }),

  // Registration info
  registrationStatus: text("registration_status", {
    enum: ["pending", "approved", "rejected", "waitlisted", "checked_in"]
  }).notNull().default("pending"),

  // Team info (optional, participant can be solo)
  teamId: uuid("team_id")
    .references(() => hackathonTeams.id, { onDelete: "set null" }),

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
    enum: ["Freshman", "Sophomore", "Junior", "Senior", "Graduate", "PhD", "Other"]
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
  hasSubmittedProject: boolean("has_submitted_project").notNull().default(false),

  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("participant_hackathon_id_idx").on(table.hackathonId),
  index("participant_user_id_idx").on(table.userId),
  index("participant_team_id_idx").on(table.teamId),
  // Enforce one registration per user per hackathon at the DB level.
  // This prevents duplicates even under concurrent requests that race
  // past the application-level findFirst check inside the transaction.
  unique("unique_participant_per_hackathon").on(table.hackathonId, table.userId),
]);

// Project submissions
export const hackathonProjects = pgTable("hackathon_project", {
  id: uuid("id").defaultRandom().primaryKey(),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  teamId: uuid("team_id")
    .references(() => hackathonTeams.id, { onDelete: "cascade" }),
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
  status: text("status", { enum: ["draft", "submitted", "judging", "winner"] })
    .notNull()
    .default("draft"),
  score: integer("score"),
  ranking: integer("ranking"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("project_hackathon_id_idx").on(table.hackathonId),
  index("project_team_id_idx").on(table.teamId),
  index("project_status_idx").on(table.status),
]);

// Relations
export const hackathonsRelations = relations(hackathons, ({ many }) => ({
  participants: many(hackathonParticipants),
  teams: many(hackathonTeams),
  projects: many(hackathonProjects),
}));

export const hackathonParticipantsRelations = relations(hackathonParticipants, ({ one }) => ({
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
}));

export const hackathonTeamsRelations = relations(hackathonTeams, ({ one, many }) => ({
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
}));

// Event scheduling for hackathons
export const hackathonEvents = pgTable("hackathon_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  hackathonId: uuid("hackathon_id")
    .notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ["workshop", "meal", "ceremony", "activity", "sponsor_session"] }).notNull(),
  location: text("location").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  points: integer("points").notNull().default(0), // For gamification
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("event_hackathon_id_idx").on(table.hackathonId),
  index("event_type_idx").on(table.type),
]);

// QR Check-ins for events
export const hackathonEventAttendees = pgTable("hackathon_event_attendee", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => hackathonEvents.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id")
    .notNull()
    .references(() => hackathonParticipants.id, { onDelete: "cascade" }),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
}, (table) => [
  index("event_attendee_event_id_idx").on(table.eventId),
  index("event_attendee_participant_id_idx").on(table.participantId),
  // Prevent duplicate check-ins
  unique("unique_event_participant").on(table.eventId, table.participantId),
]);

export const hackathonEventsRelations = relations(hackathonEvents, ({ one, many }) => ({
  hackathon: one(hackathons, {
    fields: [hackathonEvents.hackathonId],
    references: [hackathons.id],
  }),
  attendees: many(hackathonEventAttendees),
}));

export const hackathonEventAttendeesRelations = relations(hackathonEventAttendees, ({ one }) => ({
  event: one(hackathonEvents, {
    fields: [hackathonEventAttendees.eventId],
    references: [hackathonEvents.id],
  }),
  participant: one(hackathonParticipants, {
    fields: [hackathonEventAttendees.participantId],
    references: [hackathonParticipants.id],
  }),
}));

export const hackathonProjectsRelations = relations(hackathonProjects, ({ one }) => ({
  hackathon: one(hackathons, {
    fields: [hackathonProjects.hackathonId],
    references: [hackathons.id],
  }),
  team: one(hackathonTeams, {
    fields: [hackathonProjects.teamId],
    references: [hackathonTeams.id],
  }),
}));