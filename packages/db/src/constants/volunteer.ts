// What a volunteer application asks. The ids are what the answers store; the
// labels are what a person reads. Kept apart from the zod schema in
// @query/api so the form can import them without pulling the server in.

export const VOLUNTEER_STATUSES = [
  "pending",
  "approved",
  "declined",
  "withdrawn",
] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];

export const VOLUNTEER_AFFILIATIONS = [
  { id: "gt_student", label: "Georgia Tech student" },
  { id: "other_student", label: "Student elsewhere" },
  { id: "alum", label: "Alum" },
  { id: "industry", label: "Industry" },
] as const;
export type VolunteerAffiliation =
  (typeof VOLUNTEER_AFFILIATIONS)[number]["id"];

/**
 * The weekend in nine blocks. `day` is the offset from the edition's first
 * day (0 Friday, 1 Saturday, 2 Sunday), so a block can be shown with the
 * edition's own dates; `part` is what happens in it.
 */
export const VOLUNTEER_BLOCKS = [
  { id: "fri_setup", day: 0, part: "Afternoon setup" },
  { id: "fri_checkin", day: 0, part: "Check-in and opening" },
  { id: "fri_overnight", day: 0, part: "Overnight" },
  { id: "sat_morning", day: 1, part: "Morning" },
  { id: "sat_afternoon", day: 1, part: "Afternoon" },
  { id: "sat_evening", day: 1, part: "Evening" },
  { id: "sat_overnight", day: 1, part: "Overnight" },
  { id: "sun_morning", day: 2, part: "Morning" },
  { id: "sun_closing", day: 2, part: "Closing and teardown" },
] as const;
export type VolunteerBlock = (typeof VOLUNTEER_BLOCKS)[number]["id"];

export const VOLUNTEER_ROLES = [
  { id: "check_in", label: "Check-in desk and badges" },
  { id: "meals", label: "Meals and snacks" },
  { id: "workshops", label: "Workshop rooms" },
  { id: "help_desk", label: "Hacker help desk" },
  { id: "setup", label: "Setup and teardown" },
  { id: "judging", label: "Judging logistics (runners, room hosts)" },
  { id: "photography", label: "Photography" },
] as const;
export type VolunteerRole = (typeof VOLUNTEER_ROLES)[number]["id"];

/** The shirt sizes of the hacker form, so one order covers everyone. */
export const VOLUNTEER_SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** What the application stores in `answers`. The server's zod schema matches it. */
export interface VolunteerAnswers {
  affiliation: VolunteerAffiliation;
  availability: VolunteerBlock[];
  roles: VolunteerRole[];
  experience?: string;
  shirtSize: (typeof VOLUNTEER_SHIRT_SIZES)[number];
  /** Chips as the hacker form stores them; "Other: <text>" carries the free text. */
  dietary: string[];
  /** For day-of contact only. */
  phone: string;
  acknowledged: true;
}

export const volunteerAffiliationLabel = (id: string) =>
  VOLUNTEER_AFFILIATIONS.find((a) => a.id === id)?.label ?? id;

export const volunteerRoleLabel = (id: string) =>
  VOLUNTEER_ROLES.find((r) => r.id === id)?.label ?? id;
