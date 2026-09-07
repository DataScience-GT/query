import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * One resume per person. Metadata only — the PDF lives in Cloud Storage under
 * `storageKey`, because 5000 resumes is 1.5-10 GB and this database is 0.5 GB.
 */
export const memberResumes = pgTable("member_resume", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Object name in the resume bucket. Derived from userId, stored so a future layout change is a backfill rather than a guess. */
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
