import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import type { DrizzleDB } from "@query/db";
import { DAY, SITE_ORIGIN } from "@query/core";
import {
  hackathonApplicationDrafts as drafts,
  hackathonBans,
  hackathonParticipants,
  hackathons,
  judges,
  users,
} from "@query/db";

/** How long a draft sits untouched before its owner is nudged. */
export const REMINDER_AFTER_MS = 3 * DAY;

/**
 * Most reminders one run sends. The mail account behind this is shared with
 * sign-in codes and acceptances and caps out near 500 a day, and a draft left
 * over from one run is picked up by the next.
 */
export const REMINDER_BATCH = 200;

/** Mailed at once. The mailer pools its connections; this keeps a run well inside a request. */
const SEND_CONCURRENCY = 10;

export type ReminderRun = {
  /** Drafts this run took the right to mail. */
  claimed: number;
  sent: number;
  /** Mails the provider refused. Their claim is released, so the next run tries them again. */
  failed: number;
};

/**
 * Mails one reminder to each person who started an application, stopped, and
 * has not touched it for three days.
 *
 * A draft qualifies when it was last saved at or before `now` minus three days,
 * has not been mailed, and its edition is still open with the deadline ahead.
 * The owner must have no application for that edition, no judge row for it
 * (they could not apply) and no ban.
 *
 * At most once per draft, and safe to run twice at the same time. The claim is
 * a single UPDATE that stamps `reminder_sent_at` where it is still null, and
 * only the rows that UPDATE returns are mailed, so a second run finds them
 * taken. The stamp comes before the mail on purpose: a crash in between loses
 * one reminder, where the other order could send it twice. A mail the provider
 * refuses has its stamp cleared again, so an outage costs a day, not the
 * reminder. Editing a draft afterwards does not clear the stamp.
 */
export async function sendApplicationReminders(
  db: DrizzleDB,
  now: Date = new Date(),
): Promise<ReminderRun> {
  const cutoff = new Date(now.getTime() - REMINDER_AFTER_MS);

  // Every condition that can change under us is repeated in the UPDATE below.
  // Postgres re-checks only the outer WHERE after waiting on a row lock, not
  // the subquery, so a draft saved or mailed in between must fail it there.
  const untouched = and(
    isNull(drafts.reminderSentAt),
    lte(drafts.updatedAt, cutoff),
  );

  const eligible = db
    .select({ id: drafts.id })
    .from(drafts)
    .innerJoin(hackathons, eq(hackathons.id, drafts.hackathonId))
    .innerJoin(users, eq(users.id, drafts.userId))
    .where(
      and(
        untouched,
        eq(hackathons.status, "open"),
        or(
          isNull(hackathons.registrationDeadline),
          gt(hackathons.registrationDeadline, now),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(hackathonParticipants)
            .where(
              and(
                eq(hackathonParticipants.hackathonId, drafts.hackathonId),
                eq(hackathonParticipants.userId, drafts.userId),
              ),
            ),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(judges)
            .where(
              and(
                eq(judges.hackathonId, drafts.hackathonId),
                eq(judges.userId, drafts.userId),
              ),
            ),
        ),
        // Bans are keyed by trimmed, lowercased address.
        notExists(
          db
            .select({ one: sql`1` })
            .from(hackathonBans)
            .where(eq(hackathonBans.email, sql`lower(trim(${users.email}))`)),
        ),
      ),
    )
    .orderBy(asc(drafts.updatedAt))
    .limit(REMINDER_BATCH);

  const claimed = await db
    .update(drafts)
    .set({ reminderSentAt: now })
    .where(and(inArray(drafts.id, eligible), untouched))
    .returning({ id: drafts.id });

  if (claimed.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  const recipients = await db
    .select({
      id: drafts.id,
      hackathonId: drafts.hackathonId,
      hackathonName: hackathons.name,
      deadline: hackathons.registrationDeadline,
      email: users.email,
    })
    .from(drafts)
    .innerJoin(hackathons, eq(hackathons.id, drafts.hackathonId))
    .innerJoin(users, eq(users.id, drafts.userId))
    .where(
      inArray(
        drafts.id,
        claimed.map((row) => row.id),
      ),
    );

  // Loaded here so importing this module never needs mail configuration.
  const { sendApplicationReminderEmail } = await import("@query/auth/email");

  let sent = 0;
  const refused: string[] = [];
  for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
    const chunk = recipients.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((recipient) =>
        sendApplicationReminderEmail({
          email: recipient.email,
          hackathonName: recipient.hackathonName,
          hackathonUrl: `${SITE_ORIGIN}/hackathons/${recipient.hackathonId}`,
          deadline: recipient.deadline,
        }),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled") sent += 1;
      else refused.push(chunk[index]!.id);
    });
  }

  if (refused.length > 0) {
    // Only our own stamp: a run that has since claimed one of these keeps its.
    await db
      .update(drafts)
      .set({ reminderSentAt: null })
      .where(and(inArray(drafts.id, refused), eq(drafts.reminderSentAt, now)));
  }

  return { claimed: claimed.length, sent, failed: refused.length };
}
