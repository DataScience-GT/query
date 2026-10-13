import { pgEnum } from "drizzle-orm/pg-core";

// Types left behind by the retired panel judging service, which created them
// with its own SQL migrations in this database. Nothing uses them. They stay
// declared because tablesFilter in drizzle.config.ts scopes tables, not types:
// undeclared, push proposes DROP TYPE on any database that has them, and that
// prompt stops every deploy. Declared where absent, push only creates them.
// The panel's tables are excluded in drizzle.config.ts for the same reason.

export const retiredEventPhase = pgEnum("event_phase", [
  "setup",
  "submissions_open",
  "submissions_closed",
  "judging_live",
  "judging_closed",
  "published",
  "archived",
]);

export const retiredTrackKind = pgEnum("track_kind", [
  "main",
  "sponsor",
  "special",
]);

export const retiredDispatchStrategy = pgEnum("dispatch_strategy", [
  "coverage",
  "uncertainty",
]);

export const retiredJudgeStatus = pgEnum("judge_status", [
  "invited",
  "applied",
  "approved",
  "suspended",
]);

export const retiredComparisonOutcome = pgEnum("comparison_outcome", [
  "a",
  "b",
  "tie",
]);

export const retiredMembershipRole = pgEnum("membership_role", [
  "owner",
  "admin",
  "organizer",
  "volunteer",
]);
