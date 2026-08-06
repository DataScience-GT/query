import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { hackathons } from "./hackathons";

export const userProfiles = pgTable(
  "user_profile",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    bio: text("bio"),
    website: text("website"),
    location: text("location"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("profile_user_id_idx").on(table.userId)],
);

export const members = pgTable(
  "member",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // restrict, not cascade. This row is the paid club membership behind a
    // stripe_payment, and it is not reconstructible: linkPaidPaymentByVerifiedEmail
    // short-circuits on already-linked and every re-grant path filters on an
    // unlinked payment, so no amount of signing back in restores it. Deleting a
    // hackathon must fail loudly rather than quietly destroy paid records.
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "restrict" }),
    memberType: text("member_type", { enum: ["new", "continuous"] })
      .notNull()
      .default("new"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phoneNumber: text("phone_number"),
    school: text("school"),
    major: text("major"),
    graduationYear: integer("graduation_year"),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Paid the bootcamp add-on on top of the membership. Set from the payment
     * metadata, so it reflects what the member actually bought rather than
     * anything a client can assert.
     */
    bootcampMember: boolean("bootcamp_member").notNull().default(false),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    membershipStartDate: timestamp("membership_start_date").notNull(),
    membershipEndDate: timestamp("membership_end_date"),
    renewalCount: integer("renewal_count").notNull().default(0),
    skills: text("skills").array(),
    interests: text("interests").array(),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    portfolioUrl: text("portfolio_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("member_user_id_idx").on(table.userId),
    index("member_hackathon_id_idx").on(table.hackathonId),
    // Optimized for "Active Members" directory listing
    index("member_active_type_idx").on(table.isActive, table.memberType),
    unique("unique_member_per_hackathon").on(table.userId, table.hackathonId),
  ],
);

export const membershipHistory = pgTable(
  "membership_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    action: text("action", {
      enum: ["joined", "renewed", "expired", "cancelled"],
    }).notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("history_member_id_idx").on(table.memberId)],
);

export const usersRelations = relations(users, ({ one }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  member: one(members, {
    fields: [users.id],
    references: [members.userId],
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  hackathon: one(hackathons, {
    fields: [members.hackathonId],
    references: [hackathons.id],
  }),
  membershipHistory: many(membershipHistory),
}));

export const membershipHistoryRelations = relations(
  membershipHistory,
  ({ one }) => ({
    member: one(members, {
      fields: [membershipHistory.memberId],
      references: [members.id],
    }),
  }),
);
