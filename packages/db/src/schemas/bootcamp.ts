import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { events } from "./events";

/**
 * A file handed out at a bootcamp session. Metadata only — the bytes are in
 * Cloud Storage. Scoped to the session event, not to a week number, so the
 * term comes with it and the download gate needs one lookup.
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
