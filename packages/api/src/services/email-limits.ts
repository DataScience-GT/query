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
