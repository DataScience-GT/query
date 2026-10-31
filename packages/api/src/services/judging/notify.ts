import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  auditLogs,
  hackathonParticipants,
  hackathons,
  judgingAppointments,
  judgingEntries,
  judgingEntryMembers,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { emailConcurrency, forEachWithConcurrency } from "../fanout";
import { portalOrigin } from "./claims";

export type MemberAddress = {
  /** The address Devpost listed, or the one the portal member signed up with. */
  listedEmail: string;
  /** The portal account's own address once the member is linked to one. */
  accountEmail: string | null;
};

/**
 * One address per person. A linked member is mailed at the account they sign
 * in with, since the Devpost address is often not one they read here; an
 * unlinked one at the address Devpost listed. Teammates sharing an address, or
 * a person listed on two projects, get one message.
 */
export function uniqueAddresses(members: readonly MemberAddress[]): string[] {
  const seen = new Map<string, string>();
  for (const member of members) {
    const address = (member.accountEmail ?? member.listedEmail).trim();
    if (!address) continue;
    const key = address.toLowerCase();
    if (!seen.has(key)) seen.set(key, address);
  }
  return [...seen.values()];
}

/**
 * Tells the teams that have a presentation on the schedule that their times
 * and rooms are now on the Judging tab. Meant to be called without await
 * after the publish commits: it resolves rather than rejects, and logs what it
 * could not send.
 */
export async function notifyItineraryPosted(
  db: DrizzleDB,
  hackathonId: string,
): Promise<void> {
  try {
    const [hackathon] = await db
      .select({ name: hackathons.name })
      .from(hackathons)
      .where(eq(hackathons.id, hackathonId))
      .limit(1);
    if (!hackathon) return;

    // Members of every project with an appointment, Devpost members who never
    // made an account included.
    const members = await db
      .select({
        listedEmail: judgingEntryMembers.email,
        accountEmail: users.email,
      })
      .from(judgingEntryMembers)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingEntryMembers.entryId),
      )
      .leftJoin(users, eq(users.id, judgingEntryMembers.userId))
      .where(
        and(
          eq(judgingEntryMembers.hackathonId, hackathonId),
          isNull(judgingEntries.deletedAt),
          inArray(
            judgingEntries.id,
            db
              .select({ id: judgingAppointments.entryId })
              .from(judgingAppointments)
              .where(eq(judgingAppointments.hackathonId, hackathonId)),
          ),
        ),
      );

    const addresses = uniqueAddresses(members);
    if (addresses.length === 0) return;

    const { sendJudgingTimesPostedEmail } = await import("@query/auth/email");
    const host = portalOrigin();

    await forEachWithConcurrency(addresses, emailConcurrency(), async (email) => {
      try {
        await sendJudgingTimesPostedEmail({
          email,
          hackathonName: hackathon.name,
          hackathonId,
          host,
        });
      } catch (error) {
        // Deliberate operational logging: the only record of which address the
        // provider rejected.
        // oxlint-disable-next-line no-console
        console.error(
          `[Judging] Itinerary notice to ${email} failed:`,
          error,
        );
      }
    });
  } catch (error) {
    // Deliberate operational logging: the publish stands, and this is the only
    // record that the notices did not go out.
    // oxlint-disable-next-line no-console
    console.error(
      `[Judging] Itinerary notices for ${hackathonId} failed:`,
      error,
    );
  }
}

/**
 * Whether this edition's results were published before. The placings carry
 * only the current publish, so the audit trail is what remembers an earlier
 * one; a republish after a correction must not announce the results again.
 * Read before the new publish is recorded.
 */
export async function resultsPublishedBefore(
  db: DrizzleDB,
  hackathonId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "judging.results.publish"),
        eq(auditLogs.resourceId, hackathonId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Tells the edition's accepted hackers, and every member of a judged project,
 * that the results are on the Results tab. Called without await after the
 * first publish, like notifyItineraryPosted: it resolves rather than rejects.
 */
export async function notifyResultsPublished(
  db: DrizzleDB,
  hackathonId: string,
): Promise<void> {
  try {
    const [hackathon] = await db
      .select({ name: hackathons.name })
      .from(hackathons)
      .where(eq(hackathons.id, hackathonId))
      .limit(1);
    if (!hackathon) return;

    const [hackers, members] = await Promise.all([
      db
        .select({ email: users.email })
        .from(hackathonParticipants)
        .innerJoin(users, eq(users.id, hackathonParticipants.userId))
        .where(
          and(
            eq(hackathonParticipants.hackathonId, hackathonId),
            inArray(hackathonParticipants.registrationStatus, [
              "approved",
              "checked_in",
            ]),
          ),
        ),
      db
        .select({
          listedEmail: judgingEntryMembers.email,
          accountEmail: users.email,
        })
        .from(judgingEntryMembers)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEntryMembers.entryId),
        )
        .leftJoin(users, eq(users.id, judgingEntryMembers.userId))
        .where(
          and(
            eq(judgingEntryMembers.hackathonId, hackathonId),
            isNull(judgingEntries.deletedAt),
          ),
        ),
    ]);

    const addresses = uniqueAddresses([
      ...hackers.map((row) => ({ listedEmail: row.email, accountEmail: null })),
      ...members,
    ]);
    if (addresses.length === 0) return;

    const { sendResultsPublishedEmail } = await import("@query/auth/email");
    const host = portalOrigin();
    const resultsUrl = `${host}/hackathons/${hackathonId}?tab=RESULTS`;

    await forEachWithConcurrency(addresses, emailConcurrency(), async (email) => {
      try {
        await sendResultsPublishedEmail({
          email,
          hackathonName: hackathon.name,
          resultsUrl,
          host,
        });
      } catch (error) {
        // Deliberate operational logging: the only record of which address the
        // provider rejected.
        // oxlint-disable-next-line no-console
        console.error(`[Judging] Results notice to ${email} failed:`, error);
      }
    });
  } catch (error) {
    // Deliberate operational logging: the publish stands, and this is the only
    // record that the notices did not go out.
    // oxlint-disable-next-line no-console
    console.error(`[Judging] Results notices for ${hackathonId} failed:`, error);
  }
}
