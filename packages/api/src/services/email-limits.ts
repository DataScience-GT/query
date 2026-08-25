/**
 * How many people one mass send may reach, in one place.
 *
 * This number lived as a literal in three places — the `participantIds` cap in
 * `sendMassAcceptanceEmails`, the chunk size the attendees table sends in, and
 * the wave-size bound in the acceptance-waves form. They have to agree: if the
 * UI ever chunks larger than the procedure accepts, every send fails outright
 * on input validation, and if it chunks smaller the extra round trips are
 * silent waste.
 *
 * Two separate ceilings sit behind it:
 *
 *  - The mail account's daily quota. Sending still goes through a consumer
 *    Gmail account (~500/day) shared with *every other* email the portal
 *    sends, including the sign-in verification codes. A wave sized at the full
 *    quota therefore takes out sign-in for the rest of the day, which is worst
 *    exactly when it matters — the morning of an event. A batch well under the
 *    quota leaves room for people to actually log in.
 *
 *  - Cloud Run's 300s request kill. Sends are sequential, so the batch has to
 *    finish inside that. The per-recipient `acceptanceEmailSentAt` stamp makes
 *    a mid-batch kill recoverable rather than a disaster, but a batch that
 *    reliably completes is better than one that reliably resumes.
 *
 * Raise it when the mail provider moves off Gmail — at that point the daily
 * quota stops binding and the 300s request kill is the only limit left.
 */
export const MASS_EMAIL_BATCH = 200;
