import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// One row per five-minute bucket per app instance, for the /status page.
// Instances write their own rows so a scale-down loses nothing already
// written; readers sum across instances. Aggregates only: no user, route
// or request detail is stored. Rows older than 90 days are deleted lazily by
// the recorder in packages/api.
export const statusSample = pgTable(
  "status_sample",
  {
    bucketStart: timestamp("bucket_start", { mode: "date" }).notNull(),
    instanceId: text("instance_id").notNull(),
    requests: integer("requests").notNull().default(0),
    // Server errors only (5xx-class). Client errors are not downtime.
    errors: integer("errors").notNull().default(0),
    p50Ms: integer("p50_ms").notNull().default(0),
    p95Ms: integer("p95_ms").notNull().default(0),
    dbOk: boolean("db_ok").notNull().default(true),
    dbMs: integer("db_ms").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.bucketStart, table.instanceId] }),
    index("status_sample_bucket_idx").on(table.bucketStart),
  ],
);
