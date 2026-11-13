/**
 * The edition's dates and name, in one place. The page copy, the JSON-LD
 * Event, the countdown and the schedule all read from here, so moving the
 * weekend is one edit.
 */

export const EVENT_YEAR = 2027;
export const EVENT_NAME = `Hacklytics ${EVENT_YEAR}`;
export const EVENT_THEME = "Digital Bloom";

const START_DAY = 26;
const END_DAY = 28;

/** Check-in opens 5pm ET on the Friday; the weekend ends 4pm ET on the Sunday. */
export const EVENT_START_ISO = `${EVENT_YEAR}-02-${START_DAY}T17:00:00-05:00`;
export const EVENT_END_ISO = `${EVENT_YEAR}-02-${END_DAY}T16:00:00-05:00`;

export const EVENT_START_LABEL = `Feb ${START_DAY}`;
export const EVENT_END_LABEL = `Feb ${END_DAY}`;
export const EVENT_DAY_LABELS = [
  EVENT_START_LABEL,
  `Feb ${START_DAY + 1}`,
  EVENT_END_LABEL,
] as const;

export const EVENT_DATES_SHORT = `Feb ${START_DAY}–${END_DAY}, ${EVENT_YEAR}`;
export const EVENT_DATES_LONG = `February ${START_DAY}–${END_DAY}, ${EVENT_YEAR}`;
