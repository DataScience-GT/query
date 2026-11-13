import { MINUTE } from "@query/db/constants";

// How many people one mass send may reach, in one place. This lived as a
// literal in three places — the `participantIds` cap, the chunk size the
// attendees table sends in, and the wave-size bound — and they have to agree:
// chunk larger than the procedure accepts and every send fails validation.
// Two ceilings sit behind it. The mail account's daily quota: sending still
// goes through a consumer Gmail account (~500/day) shared with the sign-in
// codes, so a wave sized at the full quota takes out sign-in for the rest of
// the day. And Cloud Run's 300s kill: sends are sequential, and the
// per-recipient stamp makes a mid-batch kill recoverable, but a batch that
// completes beats one that resumes. Raise it once the provider leaves Gmail.
export const MASS_EMAIL_BATCH = 200;

// Recipients per request. See MASS_EMAIL_BATCH on the client: each is an SMTP
// round trip, and more does not finish inside Cloud Run's timeout.
export const MAX_RECIPIENTS_PER_CALL = 500;

// How long a claimed-but-unsent recipient stays claimed. Long enough that a
// batch working through 500 round trips is never reclaimed underneath itself,
// short enough that a request killed by a deploy does not strand rows.
export const CLAIM_TIMEOUT_MS = 15 * MINUTE;
