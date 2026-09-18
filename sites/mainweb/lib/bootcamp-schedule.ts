/**
 * The public bootcamp syllabus. The portal's downloadable weekly material is
 * edited separately, while the marketing page still needs stable public copy.
 */

export type BootcampWeek = {
  week: number;
  title: string;
  desc: string;
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

// Empty until the real syllabus is written. The twelve weeks that used to sit
// here were placeholder copy, and a made-up curriculum on a public page is
// worse than saying it is coming. Every surface renders "updating soon" while
// this is empty.
export const BOOTCAMP_CURRICULUM: BootcampWeek[] = [];

/** The curriculum entry a session's week number refers to, if there is one. */
export const weekEntry = (week: number | null) =>
  week === null
    ? undefined
    : BOOTCAMP_CURRICULUM.find((entry) => entry.week === week);
