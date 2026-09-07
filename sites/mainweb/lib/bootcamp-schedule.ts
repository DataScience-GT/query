/**
 * The bootcamp as published. A constant, not a table: nothing edits a
 * curriculum, and the marketing page needs the same weeks.
 *
 * The material stays on Deepnote — its notebooks are behind Deepnote's own
 * sign-in, so an iframe renders a login wall. Linking out is the integration.
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
 * Where and when it meets. Null until filled in; every surface renders "to be
 * announced" rather than a blank line.
 */
export const BOOTCAMP_ROOM: string | null = null;
export const BOOTCAMP_MEETING_TIME: string | null = null;

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
