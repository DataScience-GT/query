// How many people one mass send may reach, in one place. This lived as a
// literal in three places — the `participantIds` cap, the chunk size the
// attendees table sends in, and the wave-size bound — and they have to agree:
// chunk larger than the procedure accepts and every send fails validation.
// Cloud Run's 300s kill is the remaining ceiling: sends are sequential, and
// the per-recipient stamp makes a mid-batch kill recoverable, but a batch
// that completes beats one that resumes. Mail itself is Resend SMTP.
export const MASS_EMAIL_BATCH = 200;
