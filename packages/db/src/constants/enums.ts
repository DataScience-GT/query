export const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "moderator",
  "volunteer",
  "bug_tester",
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const HACKATHON_STATUSES = [
  "draft",
  "announced",
  "open",
  "closed",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type HackathonStatus = (typeof HACKATHON_STATUSES)[number];

export const PARTICIPANT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "waitlisted",
  "checked_in",
] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export const LEVELS_OF_STUDY = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Graduate",
  "PhD",
  "Other",
] as const;
export type LevelOfStudy = (typeof LEVELS_OF_STUDY)[number];

export const JUDGING_STATES = ["draft", "open", "closed"] as const;
export type JudgingState = (typeof JUDGING_STATES)[number];

export const CHECK_IN_METHODS = ["scan", "code", "manual"] as const;
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];
