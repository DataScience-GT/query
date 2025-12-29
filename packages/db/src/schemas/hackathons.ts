import { pgTable, text, timestamp, uuid, boolean, integer, json } from "drizzle-orm/pg-core";
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
  maxParticipants: integer("max_participants"),
  currentParticipants: integer("current_participants").notNull().default(0),
  status: text("status", { enum: ["draft", "open", "closed", "in_progress", "completed", "cancelled"] })
    .notNull()
    .default("draft"),
  prizes: json("prizes").$type<{ place: string; amount: number; description?: string }[]>(),
  rules: text("rules"),
  theme: text("theme"),
  websiteUrl: text("website_url"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
});

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

  // Participant details
  shirtSize: text("shirt_size", { enum: ["XS", "S", "M", "L", "XL", "XXL"] }),
  dietaryRestrictions: text("dietary_restrictions").array(),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),

  // Participation tracking
  checkedInAt: timestamp("checked_in_at"),
  hasSubmittedProject: boolean("has_submitted_project").notNull().default(false),

  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
});

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