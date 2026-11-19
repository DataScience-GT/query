import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";

// One row per five-minute bucket per app instance, for the /status page.
// Instances write their own rows so a scale-down loses nothing already
// written; readers sum across instances. Aggregates only: no user, route
// or request detail is stored. Rows older than 90 days are deleted lazily by
// the recorder in packages/api. The primary key leads with bucket_start, so
// it also serves the range reads and the prune.
export const statusSample = pgTable(
  "status_sample",
  {
    bucketStart: timestamp("bucket_start", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    instanceId: text("instance_id").notNull(),
    requests: integer("requests").notNull().default(0),
    // Server errors only (5xx-class). Client errors are not downtime.
    errors: integer("errors").notNull().default(0),
    p50Ms: integer("p50_ms").notNull().default(0),
    p95Ms: integer("p95_ms").notNull().default(0),
    // Nullable, not default 0: rows written before this column existed have no
    // p99, and 0 would read as a perfect one. Additive, so `drizzle-kit push`
    // adds it without a prompt.
    p99Ms: integer("p99_ms"),
    dbOk: boolean("db_ok").notNull().default(true),
    dbMs: integer("db_ms").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.bucketStart, table.instanceId] })],
);
