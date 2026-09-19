/**
 * The bootcamp syllabus shown on the public marketing page. The portal lists
 * real scheduled workshops from the database instead, so nothing here reaches
 * a signed-in member.
 */

export type BootcampWeek = {
  week: number;
  title: string;
  /** Optional: a week may be published as a title alone. */
  desc?: string;
  /** Overrides the default room for a week that moves. */
  room?: string;
  /** The notebook for this week, if it has its own link. */
  deepnoteUrl?: string;
};

/**
 * Where and when it meets. These remain nullable so an upcoming term can show
 * "to be announced" rather than a blank line before officers confirm logistics.
 */
export const BOOTCAMP_ROOM: string | null = "D.M. Smith 115";
export const BOOTCAMP_MEETING_TIME: string | null = "6:30–7:30 PM, Tuesdays";

/** First session. Rendered as written, so no timezone can shift the date. */
export const BOOTCAMP_START_DATE: string | null = "September 22, 2026";

/** The Deepnote workspace every session works out of. */
export const BOOTCAMP_WORKSPACE_URL: string | null = null;

export const BOOTCAMP_CURRICULUM: BootcampWeek[] = [
  { week: 1, title: "Core Library & Data Wrangling" },
  { week: 2, title: "Linear Regression" },
  { week: 3, title: "Logistic Regression" },
  { week: 4, title: "Decision Trees / Ensemble Methods" },
  { week: 5, title: "Clustering" },
  { week: 6, title: "Deep Learning" },
  { week: 7, title: "Creative Projects" },
  { week: 8, title: "Creative Projects" },
  { week: 9, title: "Creative Projects" },
];

/** The curriculum entry a session's week number refers to, if there is one. */
export const weekEntry = (week: number | null) =>
  week === null
    ? undefined
    : BOOTCAMP_CURRICULUM.find((entry) => entry.week === week);
