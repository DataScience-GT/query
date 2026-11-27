import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  VOLUNTEER_AFFILIATIONS,
  VOLUNTEER_BLOCKS,
  VOLUNTEER_MODE_IDS,
  VOLUNTEER_ONLINE_BLOCKS,
  VOLUNTEER_ROLES,
  VOLUNTEER_SHIRT_SIZES,
  VOLUNTEER_STATUSES,
  VOLUNTEER_TOPICS,
  isInPerson,
  isOnline,
} from "@query/db/constants";
import type {
  VolunteerAnswers,
  VolunteerMode,
  VolunteerStatus,
} from "@query/db/constants";
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
const onlineBlockIds = idsOf(VOLUNTEER_ONLINE_BLOCKS);
const topicIds = idsOf(VOLUNTEER_TOPICS);

const PHONE_SHAPE = /^[0-9+().\s-]*$/;
const phoneShape = "Use digits, spaces and + ( ) - only.";

const affiliation = z.enum(idsOf(VOLUNTEER_AFFILIATIONS), {
  error: "Choose what describes you.",
});
const acknowledged = z.literal(true, {
  error: "Confirm that you understand how volunteers are confirmed.",
});

// What anyone at the venue is asked.
const inPerson = {
  availability: z
    .array(z.enum(blockIds))
    .min(1, "Pick at least one time block you can cover.")
    .transform(inListOrder(blockIds)),
  roles: z.array(z.enum(roleIds)).transform(inListOrder(roleIds)),
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
};

// What anyone who will mentor online is asked.
const online = {
  topics: z
    .array(z.enum(topicIds))
    .min(1, "Pick at least one topic you can help with.")
    .transform(inListOrder(topicIds)),
  topicOther: z
    .string()
    .trim()
    .max(60, "Keep the topic under 60 characters.")
    .optional()
    .transform((value) => value || undefined),
  onlineAvailability: z
    .array(z.enum(onlineBlockIds))
    .min(1, "Pick at least one time you can be online.")
    .transform(inListOrder(onlineBlockIds)),
  mentorExperience: z
    .string({ error: "Add a line about your experience." })
    .trim()
    .min(1, "Add a line about your experience.")
    .max(500, "Keep it under 500 characters."),
};

const requiredPhone = z
  .string({ error: "Enter a phone number we can reach on event days." })
  .trim()
  .min(7, "Enter a phone number we can reach on event days.")
  .max(25, "That phone number is too long.")
  .regex(PHONE_SHAPE, phoneShape);

// An online mentor may leave the phone blank; if they give one it has to be
// one.
const optionalPhone = z
  .string()
  .trim()
  .max(25, "That phone number is too long.")
  .refine((v) => v === "" || (v.length >= 7 && PHONE_SHAPE.test(v)), phoneShape)
  .optional()
  .transform((value) => value || undefined);

const needsOtherTopic = (a: { topics: readonly string[]; topicOther?: string | undefined }) =>
  !a.topics.includes("other") || !!a.topicOther;
const otherTopic = {
  message: "Tell us which other topic you can help with.",
  path: ["topicOther"],
};

/**
 * What an application must hold, by how the person wants to help: in person
 * needs availability, shirt size and a phone; an online mentor needs topics,
 * online hours and a line of experience, with no shirt size, diet or phone to
 * give; both needs both sets. Keys a variant does not list are dropped.
 */
export const volunteerAnswers = z.discriminatedUnion(
  "mode",
  [
    z.object({
      mode: z.literal("in_person"),
      affiliation,
      ...inPerson,
      phone: requiredPhone,
      acknowledged,
    }),
    z
      .object({
        mode: z.literal("online"),
        affiliation,
        ...online,
        phone: optionalPhone,
        acknowledged,
      })
      .refine(needsOtherTopic, otherTopic),
    z
      .object({
        mode: z.literal("both"),
        affiliation,
        ...inPerson,
        ...online,
        phone: requiredPhone,
        acknowledged,
      })
      .refine(needsOtherTopic, otherTopic),
  ],
  { error: "Choose how you want to help." },
);

/**
 * What is written to `answers`. The text behind "other" is kept only while
 * "other" is picked, so a topic changed after typing it leaves nothing stale.
 */
export function storedAnswers(
  parsed: z.output<typeof volunteerAnswers>,
): VolunteerAnswers {
  if (isOnline(parsed) && !parsed.topics.includes("other")) {
    const { topicOther: _dropped, ...rest } = parsed;
    return rest as VolunteerAnswers;
  }
  return parsed;
}

/** Hackathon statuses that take new volunteer applications. */
const ACCEPTING_STATUSES = ["announced", "open"] as const;
/** Statuses in which a pending application can still be corrected. */
const EDITABLE_STATUSES = ["announced", "open", "closed", "in_progress"] as const;

/**
 * The editions a person is approved to volunteer at, or just the one named.
 * The one place that answers "approved": the Discord role code calls this (or
 * `isApprovedVolunteer`) rather than reading the table, so a change to what
 * "approved" means lands once.
 */
export async function approvedVolunteerEditions(
  db: DrizzleDB,
  userId: string,
  hackathonId?: string,
): Promise<string[]> {
  const rows = await db.query.hackathonVolunteerApplications.findMany({
    where: { userId, status: "approved", ...(hackathonId ? { hackathonId } : {}) },
    columns: { hackathonId: true },
  });
  return rows.map((row) => row.hackathonId);
}

/** Whether a person has been approved to volunteer at an edition. */
export async function isApprovedVolunteer(
  db: DrizzleDB,
  userId: string,
  hackathonId: string,
): Promise<boolean> {
  return (await approvedVolunteerEditions(db, userId, hackathonId)).length > 0;
}

type Edition = {
  isPublic: boolean;
  status: string;
  startDate: Date | string;
  endDate: Date | string;
};

const editionColumns = {
  isPublic: true,
  status: true,
  startDate: true,
  endDate: true,
} as const;

/**
 * Whether new applications are taken: an edition people can see, announced or
 * open, with the event not yet started. The deadline is the event's start
 * date; after that organizers are confirming a roster, not recruiting. A
 * withdrawn applicant applying again is held to the same window.
 */
export const takesNewApplications = (
  edition: Edition,
  now: Date = new Date(),
) =>
  edition.isPublic &&
  (ACCEPTING_STATUSES as readonly string[]).includes(edition.status) &&
  now < new Date(edition.startDate);

/** A pending application can be corrected until the edition is over. */
export const allowsEdits = (edition: Edition, now: Date = new Date()) =>
  (EDITABLE_STATUSES as readonly string[]).includes(edition.status) &&
  now <= new Date(edition.endDate);

export async function loadEdition(db: DrizzleDB, hackathonId: string) {
  return db.query.hackathons.findFirst({
    where: { id: hackathonId },
    columns: editionColumns,
  });
}

export async function assertTakingApplications(
  db: DrizzleDB,
  hackathonId: string,
) {
  const edition = await loadEdition(db, hackathonId);
  if (!edition || !edition.isPublic || edition.status === "draft") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That hackathon is not taking volunteer applications.",
    });
  }
  if (!takesNewApplications(edition, new Date())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Volunteer applications for this hackathon are closed.",
    });
  }
}

export async function assertEditionNotOver(
  db: DrizzleDB,
  hackathonId: string,
  now: Date = new Date(),
) {
  const edition = await loadEdition(db, hackathonId);
  if (!edition || !allowsEdits(edition, now)) {
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
  /** How they want to help (the `mode` column). */
  mode: z.enum(VOLUNTEER_MODE_IDS).optional(),
  /** In-person role. */
  role: z.enum(roleIds).optional(),
  /** In-person time block. */
  block: z.enum(blockIds).optional(),
  /** A topic an online mentor can help with. */
  topic: z.enum(topicIds).optional(),
  /** An online hour block, Eastern time. */
  onlineBlock: z.enum(onlineBlockIds).optional(),
});
export type VolunteerFilter = z.infer<typeof volunteerFilter>;

type RosterRow = {
  status: VolunteerStatus;
  mode: VolunteerMode;
  answers: VolunteerAnswers;
};

/**
 * The rows that match every filter that is set. A role or time block is an
 * in-person answer, a topic or online hour an online one, so an online-only
 * mentor matches neither of the first two.
 */
export function matchingVolunteers<T extends RosterRow>(
  rows: readonly T[],
  {
    status,
    mode,
    role,
    block,
    topic,
    onlineBlock,
  }: Omit<VolunteerFilter, "hackathonId">,
): T[] {
  return rows.filter((row) => {
    const { answers } = row;
    if (status && row.status !== status) return false;
    if (mode && row.mode !== mode) return false;
    if (role && !(isInPerson(answers) && answers.roles.includes(role)))
      return false;
    if (block && !(isInPerson(answers) && answers.availability.includes(block)))
      return false;
    if (topic && !(isOnline(answers) && answers.topics.includes(topic)))
      return false;
    if (
      onlineBlock &&
      !(isOnline(answers) && answers.onlineAvailability.includes(onlineBlock))
    )
      return false;
    return true;
  });
}

export type Coverage = Record<string, { approved: number; pending: number }>;

const emptyCount = () => ({ approved: 0, pending: 0 });
const emptyCoverage = (ids: readonly { id: string }[]): Coverage =>
  Object.fromEntries(ids.map(({ id }) => [id, emptyCount()]));

/**
 * Who could cover what. Counts per in-person time block and role, and per
 * online hour block and mentor topic, split by whether the person is already
 * approved or still waiting, so organisers see both the roster they have and
 * the one they could have. Someone who chose both counts in both halves.
 * Declined and withdrawn people cover nothing. `byMode` is how many chose
 * each way of helping, by the same split.
 */
export function volunteerCoverage(rows: readonly RosterRow[]) {
  const blocks = emptyCoverage(VOLUNTEER_BLOCKS);
  const roles = emptyCoverage(VOLUNTEER_ROLES);
  const onlineBlocks = emptyCoverage(VOLUNTEER_ONLINE_BLOCKS);
  const topics = emptyCoverage(VOLUNTEER_TOPICS);
  const byMode: Coverage = Object.fromEntries(
    VOLUNTEER_MODE_IDS.map((id) => [id, emptyCount()]),
  );

  const byStatus = { pending: 0, approved: 0, declined: 0, withdrawn: 0 };
  for (const { status, mode, answers } of rows) {
    byStatus[status] += 1;
    if (status !== "approved" && status !== "pending") continue;
    byMode[mode]![status] += 1;
    if (isInPerson(answers)) {
      for (const id of answers.availability) blocks[id]![status] += 1;
      for (const id of answers.roles) roles[id]![status] += 1;
    }
    if (isOnline(answers)) {
      for (const id of answers.onlineAvailability)
        onlineBlocks[id]![status] += 1;
      for (const id of answers.topics) topics[id]![status] += 1;
    }
  }
  return { blocks, roles, onlineBlocks, topics, byMode, byStatus };
}
