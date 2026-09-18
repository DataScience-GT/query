import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { events } from "./events";

/**
 * One editable row per week of a bootcamp term. The ZIP bytes live in Cloud
 * Storage because workshop datasets are much larger than database records.
 *
 * This deliberately has no event foreign key: deleting or omitting a session
 * must not delete the notebooks officers published for that week.
 */
export const bootcampWorkshops = pgTable(
  "bootcamp_workshop",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Server-derived semester key, such as `2026-fall`, so clients cannot file
    // material under a cohort they do not manage.
    term: text("term").notNull(),
    // Human-facing sequence within a term; events use the same number for the
    // optional meeting-date join without owning this row.
    week: integer("week").notNull(),
    title: text("title").notNull(),
    // Object metadata sits beside the row so downloads never have to guess
    // whether an upload exists or what object layout was used at the time.
    materialsKey: text("materials_key"),
    materialsFileName: text("materials_file_name"),
    materialsSizeBytes: integer("materials_size_bytes"),
    // Solutions are independent from materials because officers post them at
    // different times and must be able to clear one without touching the other.
    solutionKey: text("solution_key"),
    solutionFileName: text("solution_file_name"),
    solutionSizeBytes: integer("solution_size_bytes"),
    // Recordings stay at their provider; only an http(s) link belongs here.
    recordingUrl: text("recording_url"),
    // Draft by default so saving metadata cannot expose a half-uploaded week.
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Declaration order matches the column order because drizzle push
    // otherwise sees a persistent constraint diff.
    unique("unique_bootcamp_workshop").on(table.term, table.week),
    // Member reads filter one term and published state together.
    index("bootcamp_workshop_term_published_idx").on(
      table.term,
      table.isPublished,
    ),
  ],
);

export type BootcampWorkshop = typeof bootcampWorkshops.$inferSelect;

/**
 * Superseded by `bootcamp_workshop`; nothing reads or writes it. Still declared
 * because deploys run `drizzle-kit push`, and removing it here would make push
 * stop at a DROP TABLE prompt. Drop it in a change of its own.
 */
export const bootcampMaterials = pgTable(
  "bootcamp_material",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedById: text("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (table) => [index("bootcamp_material_event_idx").on(table.eventId)],
);
