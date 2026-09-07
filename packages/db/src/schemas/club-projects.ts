import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { initiatives } from "./initiatives";

// The public roster on `/` and `/projects`. Separate from `initiative`, which
// is the portal object people apply to: a roster card can have no lead and no
// seats, and past projects stay listed forever.

export const clubProjectStatuses = [
  "active",
  "revived",
  "needs_lead",
  "past",
] as const;
export type ClubProjectStatus = (typeof clubProjectStatuses)[number];

export const clubProjects = pgTable(
  "club_project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: text("status", { enum: clubProjectStatuses })
      .notNull()
      .default("active"),
    // Free text, not a user reference: leads are named on a public page before
    // they ever sign in, and past leads have graduated.
    leadName: text("lead_name"),
    summary: text("summary").notNull(),
    tech: text("tech")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    repoUrl: text("repo_url"),
    joinUrl: text("join_url"),
    capacityNote: text("capacity_note"),
    term: text("term"),
    /** The portal initiative members apply to, when one exists. */
    initiativeId: uuid("initiative_id").references(() => initiatives.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("club_project_status_idx").on(table.status),
    index("club_project_published_idx").on(table.isPublished),
  ],
);

export type ClubProject = typeof clubProjects.$inferSelect;
