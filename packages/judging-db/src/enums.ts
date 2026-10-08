import { pgEnum } from "drizzle-orm/pg-core";

// Kept apart from the tables because packages/db's drizzle config loads this
// file too. Judging creates these types with its own SQL migrations; push
// must see them as declared, or it tries to drop them from the shared
// database. Its tables stay hidden from push (tablesFilter there).

export const eventPhase = pgEnum("event_phase", [
  "setup",
  "submissions_open",
  "submissions_closed",
  "judging_live",
  "judging_closed",
  "published",
  "archived",
]);

export const trackKind = pgEnum("track_kind", ["main", "sponsor", "special"]);

export const dispatchStrategy = pgEnum("dispatch_strategy", [
  "coverage",
  "uncertainty",
]);

export const judgeStatus = pgEnum("judge_status", [
  "invited",
  "applied",
  "approved",
  "suspended",
]);

export const comparisonOutcome = pgEnum("comparison_outcome", ["a", "b", "tie"]);

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "admin",
  "organizer",
  "volunteer",
]);
