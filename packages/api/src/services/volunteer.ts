import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  VOLUNTEER_AFFILIATIONS,
  VOLUNTEER_BLOCKS,
  VOLUNTEER_ROLES,
  VOLUNTEER_SHIRT_SIZES,
  VOLUNTEER_STATUSES,
} from "@query/db/constants";
import type { VolunteerAnswers, VolunteerStatus } from "@query/db/constants";
import type { DrizzleDB } from "@query/db";

// What a volunteer application asks, as the server holds it to. The form's
// ids and labels live in @query/db/constants; this is the check on top of
// them. zod drops every key not listed, so a payload carrying more than the
// form asks (a client adding fields, a draft from an older form) is stored
// without it.

const idsOf = <const T extends readonly { id: string }[]>(list: T) =>
  list.map((item) => item.id) as unknown as [T[number]["id"], ...T[number]["id"][]];

/** In the form's own order, once each, so counts and exports read the same. */
const inListOrder = <T extends string>(order: readonly T[]) =>
  (picked: T[]) => order.filter((id) => picked.includes(id));

const blockIds = idsOf(VOLUNTEER_BLOCKS);
const roleIds = idsOf(VOLUNTEER_ROLES);

export const volunteerAnswers = z.object({
  affiliation: z.enum(idsOf(VOLUNTEER_AFFILIATIONS), {
    error: "Choose how you're connected to Georgia Tech.",
  }),
  availability: z
    .array(z.enum(blockIds))
    .min(1, "Pick at least one time block you can cover.")
    .transform(inListOrder(blockIds)),
  roles: z
    .array(z.enum(roleIds))
    .transform(inListOrder(roleIds)),
  experience: z
    .string()
    .trim()
    .max(1000, "Keep it under 1,000 characters.")
    .optional()
    .transform((value) => value || undefined),
  shirtSize: z.enum(VOLUNTEER_SHIRT_SIZES, { error: "Choose a shirt size." }),
  dietary: z
    .array(z.string().trim().min(1).max(100))
    .max(10)
    .refine(
      (list) => !list.some((d) => d === "Other" || d === "Other:"),
      "Tell us your dietary restriction.",
    ),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a phone number we can reach on event days.")
    .max(25, "That phone number is too long.")
    .regex(/^[0-9+().\s-]+$/, "Use digits, spaces and + ( ) - only."),
  acknowledged: z.literal(true, {
    error: "Confirm that you understand how volunteers are confirmed.",
  }),
});

// The parsed output is written to `answers` as VolunteerAnswers, so the
// stored type and this schema cannot drift apart without a compile error.

/** Hackathon statuses that take new volunteer applications. */
const ACCEPTING_STATUSES = ["announced", "open"] as const;
/** Statuses in which a pending application can still be corrected. */
const EDITABLE_STATUSES = ["announced", "open", "closed", "in_progress"] as const;

/**
 * Whether a person has been approved to volunteer at an edition. The one
 * place that answers it: the Discord role code should call this rather than
 * reading the table, so a change to what "approved" means lands once.
 */
export async function isApprovedVolunteer(
  db: DrizzleDB,
  userId: string,
  hackathonId: string,
): Promise<boolean> {
  const row = await db.query.hackathonVolunteerApplications.findFirst({
    where: { userId, hackathonId, status: "approved" },
    columns: { id: true },
  });
  return !!row;
}

/**
 * A new application, or one reopened after a withdrawal, needs an edition
 * people can see, still announced or open, and the event not yet started.
 * The deadline is the event's start date: after that, organizers are
 * confirming a roster, not recruiting.
 */
export async function assertTakingApplications(
  db: DrizzleDB,
  hackathonId: string,
  now: Date = new Date(),
) {
  const hackathon = await db.query.hackathons.findFirst({
    where: { id: hackathonId },
    columns: { isPublic: true, status: true, startDate: true },
  });
  if (!hackathon || !hackathon.isPublic || hackathon.status === "draft") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That hackathon is not taking volunteer applications.",
    });
  }
  if (
    !(ACCEPTING_STATUSES as readonly string[]).includes(hackathon.status) ||
    now >= new Date(hackathon.startDate)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Volunteer applications for this hackathon are closed.",
    });
  }
}

/** A pending application can be corrected until the edition is over. */
export async function assertEditionNotOver(
  db: DrizzleDB,
  hackathonId: string,
  now: Date = new Date(),
) {
  const hackathon = await db.query.hackathons.findFirst({
    where: { id: hackathonId },
    columns: { status: true, endDate: true },
  });
  if (
    !hackathon ||
    !(EDITABLE_STATUSES as readonly string[]).includes(hackathon.status) ||
    now > new Date(hackathon.endDate)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This hackathon is over, so applications can't be edited.",
    });
  }
}

// ── The organisers' roster ──

export const volunteerFilter = z.object({
  hackathonId: z.string().uuid(),
  status: z.enum(VOLUNTEER_STATUSES).optional(),
  role: z.enum(idsOf(VOLUNTEER_ROLES)).optional(),
  block: z.enum(idsOf(VOLUNTEER_BLOCKS)).optional(),
});
export type VolunteerFilter = z.infer<typeof volunteerFilter>;

type RosterRow = {
  status: VolunteerStatus;
  answers: Pick<VolunteerAnswers, "availability" | "roles">;
};

/** The rows that match every filter that is set. */
export function matchingVolunteers<T extends RosterRow>(
  rows: readonly T[],
  { status, role, block }: Pick<VolunteerFilter, "status" | "role" | "block">,
): T[] {
  return rows.filter(
    (row) =>
      (!status || row.status === status) &&
      (!role || row.answers.roles.includes(role)) &&
      (!block || row.answers.availability.includes(block)),
  );
}

export type Coverage = Record<string, { approved: number; pending: number }>;

/**
 * Who could cover what. Counts per time block and per role, split by whether
 * the person is already approved or still waiting, so organisers see both the
 * roster they have and the one they could have. Declined and withdrawn people
 * cover nothing.
 */
export function volunteerCoverage(rows: readonly RosterRow[]) {
  const blocks: Coverage = {};
  const roles: Coverage = {};
  for (const { id } of VOLUNTEER_BLOCKS) blocks[id] = { approved: 0, pending: 0 };
  for (const { id } of VOLUNTEER_ROLES) roles[id] = { approved: 0, pending: 0 };

  const byStatus = { pending: 0, approved: 0, declined: 0, withdrawn: 0 };
  for (const row of rows) {
    byStatus[row.status] += 1;
    if (row.status !== "approved" && row.status !== "pending") continue;
    for (const id of row.answers.availability) blocks[id]![row.status] += 1;
    for (const id of row.answers.roles) roles[id]![row.status] += 1;
  }
  return { blocks, roles, byStatus };
}
