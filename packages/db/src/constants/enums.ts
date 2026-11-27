export const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "moderator",
  "volunteer",
  "bug_tester",
] as const;

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

export const YES_NO_PREFER_NOT = ["Yes", "No", "Prefer not to say"] as const;

export const TRAVEL_DISTANCES = [
  "I'm already in Atlanta",
  "Under 100 miles",
  "100 to 500 miles",
  "Over 500 miles",
  "From outside the U.S.",
] as const;

export const TRAVEL_METHODS = [
  "Car",
  "Bus",
  "Train",
  "Plane",
  "Walk or transit",
  "Other",
] as const;

export const REFERRAL_SOURCES = [
  "Instagram",
  "LinkedIn",
  "Discord",
  "A friend",
  "A professor or class",
  "DS@GT",
  "MLH",
  "Email",
  "Other",
] as const;

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

export const CHECK_IN_METHODS = ["scan", "code", "manual"] as const;
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];
