export const VENUE_TZ = "America/New_York";

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** How early before an event's start a hacker may check themselves in. */
export const SELF_CHECK_IN_LEAD_MS = 15 * MINUTE;

/** Width of one /status uptime bucket, shared by the sampler and the page. */
export const STATUS_BUCKET_MINUTES = 5;
export const STATUS_BUCKET_MS = STATUS_BUCKET_MINUTES * MINUTE;
