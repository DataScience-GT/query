// The attendee roster: paged list, matching ids and the CSV export.

import { z } from "zod";
import { isAdmin } from "../../../middleware/procedures";
import { hackathonParticipants, memberResumes, users } from "@query/db";
import { inArray, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { PARTICIPANT_STATUSES, buildAttendeeWhere } from "./attendee-where";

// buildAttendeeWhere as a relational-query filter, for db.query...findMany.
// The same rules as the builder version; the search clause is raw SQL written
// against the query's own table alias.
type AttendeeFilter = NonNullable<
  NonNullable<
    Parameters<DrizzleDB["query"]["hackathonParticipants"]["findMany"]>[0]
  >["where"]
>;

const buildAttendeeFilter = (input: {
  hackathonId: string;
  search?: string;
  status?: z.infer<typeof PARTICIPANT_STATUSES>;
  unconfirmedOnly?: boolean;
}) => {
  const clauses: AttendeeFilter[] = [];

  if (input.status) {
    clauses.push({ registrationStatus: input.status });
  }

  if (input.unconfirmedOnly) {
    clauses.push(
      { registrationStatus: "approved" },
      { attendanceConfirmedAt: { isNull: true } },
    );
  }

  const term = input.search?.trim();
  if (term) {
    // Escaped so a literal % or _ in a name searches for that character instead
    // of turning into a wildcard.
    const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push({
      RAW: (table, { sql: rawSql }) =>
        rawSql`(
        ${table.firstName} ilike ${pattern}
        or ${table.lastName} ilike ${pattern}
        or ${table.school} ilike ${pattern}
        or ${table.major} ilike ${pattern}
        or ${table.whyAttend} ilike ${pattern}
        or exists (
          select 1 from ${users} as attendee_user
          where attendee_user."id" = ${table.userId}
            and (attendee_user."name" ilike ${pattern} or attendee_user."email" ilike ${pattern})
        )
      )`,
    });
  }

  return {
    hackathonId: input.hackathonId,
    ...(clauses.length > 0 ? { AND: clauses } : {}),
  };
};

export const rosterProcedures = {
  adminGetAttendees: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        search: z.string().trim().max(200).optional(),
        status: PARTICIPANT_STATUSES.optional(),
        unconfirmedOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      // Filtering happens in the database. The old version shipped every
      // participant row — 35 columns including resumes, phone numbers and
      // 2000-character essays — so the client could filter an array it had already
      // downloaded: megabytes of PII per keystroke-triggered refetch.
      const where = buildAttendeeWhere(input);

      const [rows, [totals]] = await Promise.all([
        db.query.hackathonParticipants.findMany({
          where: buildAttendeeFilter(input),
          // The table and its expanded row. Left out: the consent flags,
          // demographics the row does not draw (pronouns, race, underrepresented,
          // first generation), hardware, member and wave ids, the team (the table does
          // not show it) and timestamps nothing shows. The CSV export reads its
          // own endpoint, with the team.
          columns: {
            id: true,
            userId: true,
            registrationStatus: true,
            registeredAt: true,
            acceptanceEmailSentAt: true,
            attendanceConfirmedAt: true,
            firstName: true,
            lastName: true,
            phone: true,
            age: true,
            gender: true,
            school: true,
            major: true,
            levelOfStudy: true,
            graduationYear: true,
            country: true,
            hackathonsAttended: true,
            resumeUrl: true,
            linkedinUrl: true,
            githubUrl: true,
            whyAttend: true,
            isGtStudent: true,
            isDsgtMember: true,
            attendedHacklyticsBefore: true,
            usCitizen: true,
            travelReimbursement: true,
            travelFromCity: true,
            travelFromState: true,
            travelFromCountry: true,
            travelDistance: true,
            travelMethod: true,
            techJourney: true,
            helpfulFeedback: true,
            trackInterest: true,
            dreamBuild: true,
            referralSource: true,
            ramadanFasting: true,
            anythingElse: true,
            favoriteFlower: true,
            favoriteSnack: true,
            excitement: true,
            shirtSize: true,
            dietaryRestrictions: true,
            emergencyContact: true,
            emergencyPhone: true,
          },
          with: {
            user: {
              columns: { id: true, name: true, email: true, image: true },
            },
          },
          orderBy: (participants, { desc }) => [
            desc(participants.registeredAt),
          ],
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(hackathonParticipants)
          .where(where),
      ]);

      // A resume uploaded to the portal lives in member_resume, not on the
      // application row, so the row's own resumeUrl is empty for those people.
      // Flagged here so the roster can link /api/resume/<userId> without
      // guessing; only this page's users, never the whole table.
      const userIds = rows.map((row) => row.userId);
      const stored =
        userIds.length === 0
          ? []
          : await db
              .select({ userId: memberResumes.userId })
              .from(memberResumes)
              .where(inArray(memberResumes.userId, userIds));
      const hasResume = new Set(stored.map((row) => row.userId));

      return {
        attendees: rows.map((row) => ({
          ...row,
          hasStoredResume: hasResume.has(row.userId),
        })),
        // How many match the current filter, so the pager knows where it ends. Not
        // the unfiltered total — conflating them makes the last page unreachable.
        matching: totals?.count ?? 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  // Just the ids matching the current filter, so "select all" means every
  // matching applicant rather than the fifty on screen. A bulk approve that
  // silently covers 50 of 2000 while reporting success is worse than one that
  // fails outright. Ids, not rows: the set is fixed at the moment the organiser
  // chose it instead of re-evaluating a filter that may have moved.
  adminGetAttendeeIds: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        search: z.string().trim().max(200).optional(),
        status: PARTICIPANT_STATUSES.optional(),
        unconfirmedOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await (ctx.db as DrizzleDB)
        .select({ id: hackathonParticipants.id })
        .from(hackathonParticipants)
        .where(buildAttendeeWhere(input))
        // Matches the batch mutation's own cap, so a selection can always be
        // acted on in a single call.
        .limit(2500);

      return rows.map((row) => row.id);
    }),

  // The whole filtered roster, for CSV export. Its own endpoint rather than a
  // flag so the one call that hands over every attendee's PII is explicit at
  // the call site and can be audited or restricted later.
  exportAttendees: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        search: z.string().trim().max(200).optional(),
        status: PARTICIPANT_STATUSES.optional(),
        unconfirmedOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).query.hackathonParticipants.findMany({
        where: buildAttendeeFilter(input),
        with: {
          user: { columns: { id: true, name: true, email: true } },
          team: { columns: { id: true, name: true } },
        },
        orderBy: (participants, { desc }) => [desc(participants.registeredAt)],
      });
    }),
};
