// The attendee filter shared by the roster and the CSV export.

import { z } from "zod";
import { hackathonParticipants, users } from "@query/db";
import { eq, and, isNull, sql } from "drizzle-orm";

export const PARTICIPANT_STATUSES = z.enum([
  "pending",
  "approved",
  "rejected",
  "waitlisted",
  "checked_in",
]);

// The WHERE shared by the paged roster and the CSV export, so the downloaded
// file matches the list on screen. ILIKE rather than lower(...) LIKE because
// it reads as what it is; neither indexes at 2000 rows, which scans fine.
export const buildAttendeeWhere = (input: {
  hackathonId: string;
  search?: string;
  status?: z.infer<typeof PARTICIPANT_STATUSES>;
  unconfirmedOnly?: boolean;
}) => {
  const clauses = [eq(hackathonParticipants.hackathonId, input.hackathonId)];

  if (input.status) {
    clauses.push(eq(hackathonParticipants.registrationStatus, input.status));
  }

  // Accepted and silent: the people whose seats are worth chasing before the
  // event. Checked-in people are not "unconfirmed", they are here.
  if (input.unconfirmedOnly) {
    clauses.push(
      eq(hackathonParticipants.registrationStatus, "approved"),
      isNull(hackathonParticipants.attendanceConfirmedAt),
    );
  }

  const term = input.search?.trim();
  if (term) {
    // Escaped so a literal % or _ in a name searches for that character instead
    // of turning into a wildcard.
    const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push(
      sql`(
        ${hackathonParticipants.firstName} ilike ${pattern}
        or ${hackathonParticipants.lastName} ilike ${pattern}
        or ${hackathonParticipants.school} ilike ${pattern}
        or ${hackathonParticipants.major} ilike ${pattern}
        or ${hackathonParticipants.whyAttend} ilike ${pattern}
        or exists (
          select 1 from ${users}
          where ${users.id} = ${hackathonParticipants.userId}
            and (${users.name} ilike ${pattern} or ${users.email} ilike ${pattern})
        )
      )`,
    );
  }

  return and(...clauses);
};
