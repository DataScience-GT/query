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

/**
 * How a volunteer wants to help. Stored as the `mode` column (so the roster
 * can filter and index on it) and again inside `answers`, which is what picks
 * the questions they were asked.
 */
export const VOLUNTEER_MODE_IDS = ["in_person", "online", "both"] as const;
export type VolunteerMode = (typeof VOLUNTEER_MODE_IDS)[number];

/** The names organizers filter by; the form words its own choices. */
export const VOLUNTEER_MODES: readonly { id: VolunteerMode; label: string }[] = [
  { id: "in_person", label: "In person" },
  { id: "online", label: "Online mentor" },
  { id: "both", label: "Both" },
];

/**
 * When an online mentor can be reachable, in Eastern time. `day` counts from
 * the edition's first day like VOLUNTEER_BLOCKS; `part` is the hours, which
 * start on that day (a late-night block ends after midnight).
 */
export const VOLUNTEER_ONLINE_BLOCKS = [
  { id: "o_fri_evening", day: 0, part: "6 to 10 pm" },
  { id: "o_fri_late", day: 0, part: "10 pm to 2 am" },
  { id: "o_sat_early", day: 1, part: "2 to 8 am" },
  { id: "o_sat_morning", day: 1, part: "8 am to 12 pm" },
  { id: "o_sat_afternoon", day: 1, part: "12 to 5 pm" },
  { id: "o_sat_evening", day: 1, part: "5 to 10 pm" },
  { id: "o_sat_late", day: 1, part: "10 pm to 2 am" },
  { id: "o_sun_early", day: 2, part: "2 to 8 am" },
  { id: "o_sun_morning", day: 2, part: "8 am to 12 pm" },
] as const;
export type VolunteerOnlineBlock =
  (typeof VOLUNTEER_ONLINE_BLOCKS)[number]["id"];

/** What a mentor can help hackers with. "other" comes with a line of text. */
export const VOLUNTEER_TOPICS = [
  { id: "python", label: "Python" },
  { id: "data_analysis", label: "Data analysis" },
  { id: "machine_learning", label: "Machine learning" },
  { id: "llm_apps", label: "LLMs and AI apps" },
  { id: "web_frontend", label: "Web and frontend" },
  { id: "backend_apis", label: "Backend and APIs" },
  { id: "databases_sql", label: "Databases and SQL" },
  { id: "data_viz", label: "Data visualization" },
  { id: "cloud_deploy", label: "Cloud and deployment" },
  { id: "pitching", label: "Pitching and presenting" },
  { id: "other", label: "Other" },
] as const;
export type VolunteerTopic = (typeof VOLUNTEER_TOPICS)[number]["id"];

interface VolunteerCommon {
  affiliation: VolunteerAffiliation;
  acknowledged: true;
}

/** Asked of anyone who will be at the venue. */
interface InPersonFields {
  availability: VolunteerBlock[];
  roles: VolunteerRole[];
  /** Event or volunteering experience. */
  experience?: string;
  shirtSize: (typeof VOLUNTEER_SHIRT_SIZES)[number];
  /** Chips as the hacker form stores them; "Other: <text>" carries the free text. */
  dietary: string[];
}

/** Asked of anyone who will mentor online. */
interface OnlineFields {
  topics: VolunteerTopic[];
  /** The text behind the "other" topic. Present only when "other" is picked. */
  topicOther?: string;
  /** Eastern time. */
  onlineAvailability: VolunteerOnlineBlock[];
  /** A short line on what they have done that qualifies them to mentor. */
  mentorExperience: string;
}

/**
 * What the application stores in `answers`: the questions depend on how the
 * person wants to help. The phone is for day-of contact, so in person and both
 * need one and an online-only mentor may give one.
 */
export type VolunteerAnswers =
  | (VolunteerCommon & InPersonFields & { mode: "in_person"; phone: string })
  | (VolunteerCommon & OnlineFields & { mode: "online"; phone?: string })
  | (VolunteerCommon &
      InPersonFields &
      OnlineFields & { mode: "both"; phone: string });

export type InPersonAnswers = Extract<
  VolunteerAnswers,
  { mode: "in_person" | "both" }
>;
export type OnlineAnswers = Extract<
  VolunteerAnswers,
  { mode: "online" | "both" }
>;

/** Narrows to the answers of someone who will be at the venue. */
export const isInPerson = (a: VolunteerAnswers): a is InPersonAnswers =>
  a.mode === "in_person" || a.mode === "both";

/** Narrows to the answers of someone who will mentor online. */
export const isOnline = (a: VolunteerAnswers): a is OnlineAnswers =>
  a.mode === "online" || a.mode === "both";

export const volunteerAffiliationLabel = (id: string) =>
  VOLUNTEER_AFFILIATIONS.find((a) => a.id === id)?.label ?? id;

export const volunteerRoleLabel = (id: string) =>
  VOLUNTEER_ROLES.find((r) => r.id === id)?.label ?? id;

export const volunteerModeLabel = (id: string) =>
  VOLUNTEER_MODES.find((m) => m.id === id)?.label ?? id;

/** A topic as a person reads it; "other" shows what they wrote. */
export const volunteerTopicLabel = (id: string, other?: string) =>
  id === "other" && other
    ? `Other: ${other}`
    : (VOLUNTEER_TOPICS.find((t) => t.id === id)?.label ?? id);
