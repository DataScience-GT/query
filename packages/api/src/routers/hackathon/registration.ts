import { z } from "zod";
import {
  LEVELS_OF_STUDY,
  REFERRAL_SOURCES,
  SHIRT_SIZES,
  TRAVEL_DISTANCES,
  TRAVEL_METHODS,
  YES_NO_PREFER_NOT,
} from "@query/db/constants";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { notHackathonBanned } from "../../middleware/procedures";
import { CacheKeys } from "../../middleware/cache";
import {
  hackathonApplicationDrafts,
  hackathonParticipants,
  memberResumes,
} from "@query/db";
import { eq, and, inArray, isNull, notInArray } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { evictParticipantCaches } from "./admin";
import { teamMemberCountsForUser } from "../../services/derived-counts";
import { saveDraftInput } from "../../services/application-drafts";
import {
  markDiscordRolesPending,
  syncDiscordRoles,
} from "../../services/discord";
import { rateLimitShared } from "../../middleware/security";
import { badRequest, conflict, forbidden, notFound } from "../errors";

// Postgres unique_violation on hackathon_participant_hackathon_user_idx — a second
// submission of the same form. Drizzle wraps every driver error in a
// DrizzleQueryError whose own `code` is undefined; the pg error carrying the
// SQLSTATE sits on `.cause`, so the chain has to be walked.
const isDuplicateRegistration = (error: unknown) => {
  for (let cursor: unknown = error, depth = 0; cursor && depth < 5; depth++) {
    if (typeof cursor !== "object") break;
    const candidate = cursor as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (candidate.code === "23505") return true;
    if (candidate.constraint === "hackathon_participant_hackathon_user_idx")
      return true;
    if (candidate.message?.includes("hackathon_participant_hackathon_user_idx"))
      return true;
    cursor = candidate.cause;
  }
  return false;
};

// The application form. Shared by register and updateMyRegistration so an
// edit is held to exactly the rules the first submission was.
// z.string().url() accepts any scheme, javascript: and data: included, and
// these links are rendered as hrefs for staff.
const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "Must start with http:// or https://");
const essay = (message: string) => z.string().trim().min(1, message).max(2000);
const shortText = (message: string) => z.string().trim().min(1, message).max(100);

const registrationForm = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
  // Personal info
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(1).max(30),
  age: z.number().int().min(13).max(120),
  gender: z.string().max(50).optional(),
  pronouns: z.string().max(50).optional(),
  race: z.string().max(100).optional(),
  underrepresented: z.boolean().optional(),
  // Academic info
  school: z.string().min(1).max(300),
  major: z.string().min(1).max(300),
  // Relative to now: a fixed 2020-2035 accepted years already past and
  // would start refusing real students in 2036.
  graduationYear: z
    .number()
    .int()
    .min(new Date().getFullYear() - 1)
    .max(new Date().getFullYear() + 8),
  levelOfStudy: z.enum(LEVELS_OF_STUDY),
  country: z.string().min(1).max(100),
  firstGeneration: z.boolean().optional(),
  // Experience
  hackathonsAttended: z.number().int().min(0).max(100).optional(),
  resumeUrl: httpUrl.max(500).optional().or(z.literal("")),
  linkedinUrl: httpUrl.max(500).optional().or(z.literal("")),
  githubUrl: httpUrl.max(500).optional().or(z.literal("")),
  whyAttend: essay("Tell us what you hope to learn or gain"),
  techJourney: essay("Tell us about your journey in tech"),
  helpfulFeedback: essay("Tell us about the most helpful feedback you've gotten"),
  dreamBuild: essay("Tell us what you would build"),
  trackInterest: shortText("Pick the track you are most interested in"),
  referralSource: z.enum(REFERRAL_SOURCES),
  anythingElse: z.string().trim().max(2000).optional(),
  // About you
  isGtStudent: z.boolean(),
  isDsgtMember: z.boolean(),
  attendedHacklyticsBefore: z.boolean(),
  usCitizen: z.enum(YES_NO_PREFER_NOT),
  // Travel
  travelReimbursement: z.boolean(),
  travelFromCity: shortText("City is required"),
  travelFromState: z.string().trim().max(100).optional(),
  travelFromCountry: shortText("Country is required"),
  travelDistance: z.enum(TRAVEL_DISTANCES),
  travelMethod: z.enum(TRAVEL_METHODS),
  // Just for fun
  favoriteFlower: z.string().trim().max(60).optional(),
  favoriteSnack: z.string().trim().max(60).optional(),
  excitement: z.number().int().min(1).max(10),
  // Logistics
  shirtSize: z.enum(SHIRT_SIZES).optional(),
  dietaryRestrictions: z.array(z.string().max(100)).max(10).optional(),
  emergencyContact: z.string().max(200).optional(),
  emergencyPhone: z.string().max(20).optional(),
  needsHardware: z.boolean().optional(),
  // The form asks this only for an event that overlaps Ramadan, so a missing
  // answer is valid. The column is nullable.
  ramadanFasting: z.enum(YES_NO_PREFER_NOT).optional(),
  // Consent
  agreeToCodeOfConduct: z
    .boolean()
    .refine((v) => v === true, {
      message: "You must agree to the Code of Conduct",
    }),
  mlhCodeOfConduct: z.boolean().refine((v) => v === true, {
    message: "You must agree to the MLH Code of Conduct",
  }),
  mlhDataSharing: z.boolean().refine((v) => v === true, {
    message: "You must agree to share your registration with MLH",
  }),
  mlhInformationalEmails: z.boolean().optional(),
});

/**
 * A resume is required: an uploaded PDF on file, or a link to one. Read from
 * the database, not the cached resume.me, so an upload made a moment ago on
 * another instance still counts.
 */
async function assertHasResume(
  db: DrizzleDB,
  userId: string,
  resumeUrl: string | undefined,
) {
  if (resumeUrl?.trim()) return;
  const [onFile] = await db
    .select({ userId: memberResumes.userId })
    .from(memberResumes)
    .where(eq(memberResumes.userId, userId))
    .limit(1);
  if (!onFile) {
    throw badRequest("Upload your resume or paste a link to it.");
  }
}

export const hackathonRegistrationRouter = createTRPCRouter({
  register: notHackathonBanned
    .input(registrationForm)
    .mutation(async ({ ctx, input }) => {
      await assertHasResume(
        ctx.db as DrizzleDB,
        ctx.userId,
        input.resumeUrl,
      );
      try {
        const { participant, hackathonName } = await (
          ctx.db as DrizzleDB
        ).transaction(async (tx) => {
          const hackathon = await tx.query.hackathons.findFirst({
            where: { id: input.hackathonId },
          });

          if (!hackathon) {
            throw notFound("Hackathon not found");
          }

          if (hackathon.status !== "open") {
            throw badRequest("Registration is not open for this hackathon");
          }

          if (
            hackathon.registrationDeadline &&
            new Date() > hackathon.registrationDeadline
          ) {
            throw badRequest("Registration deadline has passed");
          }

          const existingParticipant =
            await tx.query.hackathonParticipants.findFirst({
              where: {
                hackathonId: input.hackathonId,
                userId: ctx.userId,
              },
            });

          if (existingParticipant) {
            throw badRequest("You are already registered for this hackathon");
          }

          // The mirror of judge/portal.ts refusing applicants who registered:
          // an approved judge who also competed could grade their own team.
          const judgeRow = await tx.query.judges.findFirst({
            where: {
              hackathonId: input.hackathonId,
              userId: ctx.userId,
            },
            columns: { id: true },
          });
          if (judgeRow) {
            throw forbidden(
              "You are a judge for this hackathon, so you can't register as a hacker.",
            );
          }

          // No seat is claimed here: capacity counts accepted people, not
          // applications, so applying is never refused for being full. The
          // seat is taken when an organiser accepts (admin.ts assertSeats).
          // A membership is annual and edition-independent, so it is keyed on the
          // person alone; the edition clause used to be here and made a paying member
          // read as a non-member the moment a new edition opened.
          const member = await tx.query.members.findFirst({
            where: { userId: ctx.userId },
          });

          const [participant] = await tx
            .insert(hackathonParticipants)
            .values({
              hackathonId: input.hackathonId,
              userId: ctx.userId,
              memberId: member?.id,
              // Personal
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              age: input.age,
              gender: input.gender,
              pronouns: input.pronouns,
              race: input.race,
              underrepresented: input.underrepresented,
              // Academic
              school: input.school,
              major: input.major,
              graduationYear: input.graduationYear,
              levelOfStudy: input.levelOfStudy,
              country: input.country,
              firstGeneration: input.firstGeneration,
              // Experience
              hackathonsAttended: input.hackathonsAttended,
              resumeUrl: input.resumeUrl || undefined,
              linkedinUrl: input.linkedinUrl || undefined,
              githubUrl: input.githubUrl || undefined,
              whyAttend: input.whyAttend,
              // Logistics
              shirtSize: input.shirtSize,
              dietaryRestrictions: input.dietaryRestrictions || [],
              emergencyContact: input.emergencyContact,
              emergencyPhone: input.emergencyPhone,
              needsHardware: input.needsHardware,
              isGtStudent: input.isGtStudent,
              isDsgtMember: input.isDsgtMember,
              attendedHacklyticsBefore: input.attendedHacklyticsBefore,
              usCitizen: input.usCitizen,
              travelReimbursement: input.travelReimbursement,
              travelFromCity: input.travelFromCity,
              travelFromState: input.travelFromState || undefined,
              travelFromCountry: input.travelFromCountry,
              travelDistance: input.travelDistance,
              travelMethod: input.travelMethod,
              techJourney: input.techJourney,
              helpfulFeedback: input.helpfulFeedback,
              trackInterest: input.trackInterest,
              dreamBuild: input.dreamBuild,
              referralSource: input.referralSource,
              ramadanFasting: input.ramadanFasting,
              anythingElse: input.anythingElse || undefined,
              favoriteFlower: input.favoriteFlower || undefined,
              favoriteSnack: input.favoriteSnack || undefined,
              excitement: input.excitement,
              // Consent
              agreeToCodeOfConduct: input.agreeToCodeOfConduct,
              mlhCodeOfConduct: input.mlhCodeOfConduct,
              mlhDataSharing: input.mlhDataSharing,
              mlhInformationalEmails: input.mlhInformationalEmails,
              registrationStatus: "pending",
            })
            .returning();

          // Submitted, so the draft has done its job. Same transaction, so
          // there is no moment where someone is registered and still reminded.
          await tx
            .delete(hackathonApplicationDrafts)
            .where(
              and(
                eq(hackathonApplicationDrafts.userId, ctx.userId),
                eq(hackathonApplicationDrafts.hackathonId, input.hackathonId),
              ),
            );

          return { participant, hackathonName: hackathon.name };
        });

        // Invalidate what this registration changed, once committed: the hackathon's
        // seat count and roster, and this user's own list. Anything broader takes
        // every other user's cached hackathon data down with it. getById caches under
        // whichever of id or name was asked for, so the name-keyed copy goes too.
        ctx.cache.delete(CacheKeys.hackathon(input.hackathonId));
        ctx.cache.delete(CacheKeys.hackathon(hackathonName));
        ctx.cache.delete(`hackathon:${input.hackathonId}:participants`);
        ctx.cache.delete(`hackathon:registrations:${ctx.userId}`);

        return participant;
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        if (isDuplicateRegistration(error)) {
          throw badRequest("You are already registered for this hackathon");
        }
        // Unexpected error during registration
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Registration failed.",
          cause: error,
        });
      }
    }),


  // The application somebody started and has not submitted, for the form to
  // reopen on, here or on another device. Null when there is none.
  getMyDraft: notHackathonBanned
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [draft] = await (ctx.db as DrizzleDB)
        .select({
          data: hackathonApplicationDrafts.data,
          updatedAt: hackathonApplicationDrafts.updatedAt,
        })
        .from(hackathonApplicationDrafts)
        .where(
          and(
            eq(hackathonApplicationDrafts.userId, ctx.userId),
            eq(hackathonApplicationDrafts.hackathonId, input.hackathonId),
          ),
        )
        .limit(1);
      return draft ?? null;
    }),

  // Autosave for the application form: one row per person per edition,
  // replaced whole on every save. Refused once registration is closed or the
  // person has already applied, since there is then nothing to finish. The
  // input schema keeps only the fields a draft may hold and caps its size.
  saveMyDraft: notHackathonBanned
    .input(saveDraftInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId;

      // The form saves a moment after each pause in typing, so a long sitting
      // is dozens of saves. Per user, since the row is keyed that way and an
      // address is shared by a whole campus.
      const limit = await rateLimitShared(
        `application-draft:${userId}`,
        120,
        120 / 3600,
      );
      if (!limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Too many saves in a short time. Your answers are still kept on this device.",
        });
      }

      const hackathon = await db.query.hackathons.findFirst({
        where: { id: input.hackathonId },
        columns: { status: true, registrationDeadline: true },
      });
      if (!hackathon) {
        throw notFound("Hackathon not found");
      }
      if (
        hackathon.status !== "open" ||
        (hackathon.registrationDeadline &&
          new Date() > hackathon.registrationDeadline)
      ) {
        throw badRequest("Registration is not open for this hackathon");
      }

      const applied = await db.query.hackathonParticipants.findFirst({
        where: { hackathonId: input.hackathonId, userId },
        columns: { id: true },
      });
      if (applied) {
        throw badRequest("You are already registered for this hackathon");
      }

      const savedAt = new Date();
      await db
        .insert(hackathonApplicationDrafts)
        .values({
          userId,
          hackathonId: input.hackathonId,
          data: input.data,
          updatedAt: savedAt,
        })
        .onConflictDoUpdate({
          target: [
            hackathonApplicationDrafts.userId,
            hackathonApplicationDrafts.hackathonId,
          ],
          set: { data: input.data, updatedAt: savedAt },
        });

      return { savedAt };
    }),

  // Takes back your own registration. There was no way out at all, so an
  // accepted no-show kept a seat for good. Refused once you are part of the
  // event — on a team, checked in, or with a project — since undoing any of
  // those affects other people and is an organiser's call.
  withdrawRegistration: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const participant = await db.query.hackathonParticipants.findFirst({
        where: {
          hackathonId: input.hackathonId,
          userId: ctx.userId,
        },
        columns: { id: true, teamId: true, registrationStatus: true },
      });

      if (!participant) {
        throw notFound("You are not registered for this hackathon.");
      }

      // A finished event's registrations are its record of who took part.
      const hackathon = await db.query.hackathons.findFirst({
        where: { id: input.hackathonId },
        columns: { status: true },
      });
      if (
        hackathon?.status === "completed" ||
        hackathon?.status === "cancelled"
      ) {
        throw forbidden(
          "This hackathon is over, so registrations can't be withdrawn.",
        );
      }

      if (participant.registrationStatus === "checked_in") {
        throw forbidden(
          "You have already checked in. Ask an organizer if you need to leave the event.",
        );
      }
      // Withdrawing deletes the row, and registering again makes a fresh
      // `pending` one that acceptWave would take. That is a way round a
      // rejection or a waitlist, so those stay on record until staff act.
      if (
        participant.registrationStatus === "rejected" ||
        participant.registrationStatus === "waitlisted"
      ) {
        throw forbidden(
          "Your application has been decided, so it can't be withdrawn. Email hello@hacklytics.io if you need help.",
        );
      }
      if (participant.teamId) {
        throw forbidden("Leave your team first, then withdraw.");
      }

      const project = await db.query.hackathonProjects.findFirst({
        where: {
          hackathonId: input.hackathonId,
          submittedById: participant.id,
        },
        columns: { id: true },
      });
      if (project) {
        throw forbidden("Withdraw your project first, then your registration.");
      }

      // The checks above are a read; a badge scan or a team join can land
      // before this. Repeating them here deletes nothing in that case.
      const removed = await db.transaction(async (tx) => {
        const deleted = await tx
          .delete(hackathonParticipants)
          .where(
            and(
              eq(hackathonParticipants.id, participant.id),
              notInArray(hackathonParticipants.registrationStatus, [
                "checked_in",
                "rejected",
                "waitlisted",
              ]),
              isNull(hackathonParticipants.teamId),
            ),
          )
          .returning({ id: hackathonParticipants.id });
        // A linked Discord account is owed a sync, even if this request's own
        // attempt below does not reach Discord.
        if (deleted.length > 0) {
          await markDiscordRolesPending(tx as unknown as DrizzleDB, [
            ctx.userId,
          ]);
        }
        return deleted;
      });
      if (removed.length === 0) {
        throw conflict(
          "Your registration changed just now. Refresh the page and try again.",
        );
      }

      evictParticipantCaches(ctx.cache, input.hackathonId, [
        ctx.userId,
      ]);
      await syncDiscordRoles(db, ctx.userId);

      return { success: true };
    }),

  // Fixes an application nobody has reviewed yet. Once an organiser decides, the
  // answers are what they decided on, so the edit closes with the decision, and
  // with registration itself. The three required consents are not asked again:
  // they were needed to submit and stay as given.
  updateMyRegistration: notHackathonBanned
    .input(
      registrationForm.omit({
        agreeToCodeOfConduct: true,
        mlhCodeOfConduct: true,
        mlhDataSharing: true,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId;
      await assertHasResume(db, userId, input.resumeUrl);

      const hackathon = await db.query.hackathons.findFirst({
        where: { id: input.hackathonId },
        columns: { status: true, registrationDeadline: true },
      });
      if (!hackathon) {
        throw notFound("Hackathon not found");
      }
      if (
        hackathon.status !== "open" ||
        (hackathon.registrationDeadline &&
          new Date() > hackathon.registrationDeadline)
      ) {
        throw badRequest(
          "Registration has closed, so applications can't be edited.",
        );
      }

      const participant = await db.query.hackathonParticipants.findFirst({
        where: { hackathonId: input.hackathonId, userId },
        columns: { id: true, registrationStatus: true },
      });
      if (!participant) {
        throw notFound("You are not registered for this hackathon.");
      }
      if (participant.registrationStatus !== "pending") {
        throw forbidden(
          "Your application has been reviewed, so it can't be edited.",
        );
      }

      // The answers are replaced whole, as the form resubmits every field, so an
      // optional one left blank clears what was there. The status is in the
      // WHERE too: a decision landing after the read above must not be edited
      // under.
      const updated = await db
        .update(hackathonParticipants)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          age: input.age,
          gender: input.gender ?? null,
          pronouns: input.pronouns ?? null,
          race: input.race ?? null,
          underrepresented: input.underrepresented ?? false,
          school: input.school,
          major: input.major,
          graduationYear: input.graduationYear,
          levelOfStudy: input.levelOfStudy,
          country: input.country,
          firstGeneration: input.firstGeneration ?? false,
          hackathonsAttended: input.hackathonsAttended ?? null,
          resumeUrl: input.resumeUrl || null,
          linkedinUrl: input.linkedinUrl || null,
          githubUrl: input.githubUrl || null,
          whyAttend: input.whyAttend,
          shirtSize: input.shirtSize ?? null,
          dietaryRestrictions: input.dietaryRestrictions || [],
          emergencyContact: input.emergencyContact ?? null,
          emergencyPhone: input.emergencyPhone ?? null,
          needsHardware: input.needsHardware ?? false,
          isGtStudent: input.isGtStudent,
          isDsgtMember: input.isDsgtMember,
          attendedHacklyticsBefore: input.attendedHacklyticsBefore,
          usCitizen: input.usCitizen,
          travelReimbursement: input.travelReimbursement,
          travelFromCity: input.travelFromCity,
          travelFromState: input.travelFromState || null,
          travelFromCountry: input.travelFromCountry,
          travelDistance: input.travelDistance,
          travelMethod: input.travelMethod,
          techJourney: input.techJourney,
          helpfulFeedback: input.helpfulFeedback,
          trackInterest: input.trackInterest,
          dreamBuild: input.dreamBuild,
          referralSource: input.referralSource,
          ramadanFasting: input.ramadanFasting ?? null,
          anythingElse: input.anythingElse || null,
          favoriteFlower: input.favoriteFlower || null,
          favoriteSnack: input.favoriteSnack || null,
          excitement: input.excitement,
          mlhInformationalEmails: input.mlhInformationalEmails ?? false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(hackathonParticipants.id, participant.id),
            eq(hackathonParticipants.registrationStatus, "pending"),
          ),
        )
        .returning({ id: hackathonParticipants.id });
      if (updated.length === 0) {
        throw conflict(
          "Your application was reviewed just now, so it can't be edited. Refresh the page.",
        );
      }

      // Only this person's own list carries these answers; the public roster
      // and the seat count are untouched.
      ctx.cache.delete(`hackathon:registrations:${userId}`);

      return { success: true };
    }),

  // An accepted hacker saying they are coming. A seat is held on the strength of
  // an acceptance email, so organisers need to see who has not answered and free
  // those seats for the waitlist. Repeating it keeps the first answer. Taking
  // part, not a way out, so a ban refuses it like registering.
  confirmAttendance: notHackathonBanned
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId;

      const participant = await db.query.hackathonParticipants.findFirst({
        where: { hackathonId: input.hackathonId, userId },
        columns: {
          id: true,
          registrationStatus: true,
          attendanceConfirmedAt: true,
        },
      });
      if (!participant) {
        throw notFound("You are not registered for this hackathon.");
      }

      // checked_in is accepted too: a door scan landing before a stale tab's
      // click should not read as an error.
      if (
        participant.registrationStatus !== "approved" &&
        participant.registrationStatus !== "checked_in"
      ) {
        throw forbidden("Only accepted hackers can confirm they are coming.");
      }
      if (participant.attendanceConfirmedAt) {
        return { confirmedAt: participant.attendanceConfirmedAt };
      }

      const confirmedAt = new Date();
      const updated = await db
        .update(hackathonParticipants)
        .set({ attendanceConfirmedAt: confirmedAt, updatedAt: confirmedAt })
        .where(
          and(
            eq(hackathonParticipants.id, participant.id),
            inArray(hackathonParticipants.registrationStatus, [
              "approved",
              "checked_in",
            ]),
            isNull(hackathonParticipants.attendanceConfirmedAt),
          ),
        )
        .returning({ id: hackathonParticipants.id });
      if (updated.length === 0) {
        throw conflict(
          "Your registration changed just now. Refresh the page and try again.",
        );
      }

      // The stamp shows on this person's own registration list and on the
      // organisers' roster, which is not cached. The seat count, the public
      // roster and the analytics did not move.
      ctx.cache.delete(`hackathon:registrations:${userId}`);

      return { confirmedAt };
    }),

  myRegistrations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // getOrSet: the portal layout and the page both prefetch this, so on a cold
    // key two reads were in flight at once and each ran the query.
    return ctx.cache.getOrSet(
      `hackathon:registrations:${userId}`,
      async () => {
        const db = ctx.db as DrizzleDB;
        // Counted from the participant rows; the stored counter is retired. The
        // counts come from a subquery on the caller's own teams, not from the
        // ids the list returns, so both reads share one round trip.
        const [rows, counts] = await Promise.all([
          db.query.hackathonParticipants.findMany({
            // What the portal reads from a registration: the sidebar, dashboard,
            // event pages and submit page. The rest of the application (phone,
            // demographics, emergency contact, essay) is the viewer's own data
            // but no screen draws it from here, and the edition's rules, prizes
            // and track lists have their own read.
            columns: {
              id: true,
              hackathonId: true,
              registrationStatus: true,
              teamId: true,
              attendanceConfirmedAt: true,
              hasSubmittedProject: true,
            },
            where: { userId },
            with: {
              hackathon: {
                columns: {
                  id: true,
                  name: true,
                  description: true,
                  theme: true,
                  status: true,
                  startDate: true,
                  endDate: true,
                  registrationDeadline: true,
                },
              },
              team: {
                columns: {
                  id: true,
                  name: true,
                  captainId: true,
                  maxMembers: true,
                },
              },
            },
            orderBy: (hackathonParticipants, { desc }) => [
              desc(hackathonParticipants.registeredAt),
            ],
          }),
          teamMemberCountsForUser(db, userId),
        ]);
        return rows.map((row) => ({
          ...row,
          team: row.team
            ? { ...row.team, currentMembers: counts.get(row.team.id) ?? 0 }
            : row.team,
        }));
      },
      30,
    );
  }),
});
