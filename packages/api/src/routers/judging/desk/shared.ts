// The desk procedures (who may call, as whom) and lookups shared by the judge desk routes.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  judgeAssignments,
  judges,
  judgingBuildings,
  judgingEntryChallenges,
  judgingEvaluationRatings,
  judgingEvaluationResponses,
  judgingPresence,
  judgingRooms,
} from "@query/db";
import type { DrizzleDB ,
  judgingEvaluationDrafts,
  judgingEvaluations} from "@query/db";
import { publicProcedure } from "../../../trpc";
import {
  asJudge,
  resolveDeskPrincipal,
} from "../../../services/judging/principal";
import type { Judge } from "../../../services/judging/principal";
import { guestScope, seatOf } from "../../../services/judging/evaluation-store";
import type { ChallengeRow } from "../../../services/judging/evaluation-store";
import { effectiveMode } from "../../../services/judging/scope";

export const NOT_A_JUDGE =
  "Judge access needed. Sign in with the account an organiser approved as a judge, or scan the QR code at your judging room or table.";

// Every desk call names its edition. A member's judge access is per edition;
// a guest's cookie only opens the edition its room belongs to.
export const deskProcedure = publicProcedure
  .input(z.object({ hackathonId: z.string().uuid() }))
  .use(async ({ ctx, input, next }) => {
    const principal = await resolveDeskPrincipal(ctx.db, {
      hackathonId: input.hackathonId,
      userId: ctx.userId,
      userName: ctx.session?.user?.name,
      cookieHeader: ctx.req?.headers.get("cookie"),
    });
    if (!principal) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: NOT_A_JUDGE });
    }
    return next({ ctx: { ...ctx, principal } });
  });

/** A desk procedure for someone who can judge: a member, or a named guest. */
export const judgeProcedure = deskProcedure.use(async ({ ctx, next }) => {
  const judge = asJudge(ctx.principal);
  if (!judge) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Enter your name before you start judging.",
    });
  }
  return next({ ctx: { ...ctx, judge } });
});

export const uuid = z.string().uuid();
export const ratingsInput = z.record(uuid, z.number().int().min(1).max(5));
export const responsesInput = z.record(
  uuid,
  z.object({
    value: z.string().max(2000, "Keep each answer under 2000 characters."),
    isPublic: z.boolean(),
  }),
);
export const sectionTitle = z
  .string()
  .trim()
  .min(1, "Give the section a name.")
  .max(80, "Keep section names under 80 characters.");

export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export const NOT_OPEN_YET =
  "Judging has not opened yet. You can start once organisers open it.";
export const CLOSED = "Judging is closed. Your submitted evaluations are read-only.";

/** The (judge, project, challenge) an evaluation or draft is keyed by. */
export function taskOf<
  T extends typeof judgingEvaluations | typeof judgingEvaluationDrafts,
>(table: T, judgeId: string, entryId: string, challengeId: string) {
  return and(
    eq(table.judgeId, judgeId),
    eq(table.entryId, entryId),
    eq(table.challengeId, challengeId),
  );
}

/** Ratings and responses per evaluation, keyed by rubric item. */
export async function answersOf(db: DrizzleDB, evaluationIds: string[]) {
  const answers = new Map<
    string,
    {
      ratings: Record<string, number>;
      responses: Record<string, { value: string; isPublic: boolean }>;
    }
  >();
  if (evaluationIds.length === 0) return answers;

  const bucket = (id: string) => {
    let found = answers.get(id);
    if (!found) {
      found = { ratings: {}, responses: {} };
      answers.set(id, found);
    }
    return found;
  };

  const ratings = await db
    .select({
      evaluationId: judgingEvaluationRatings.evaluationId,
      itemId: judgingEvaluationRatings.itemId,
      value: judgingEvaluationRatings.value,
    })
    .from(judgingEvaluationRatings)
    .where(inArray(judgingEvaluationRatings.evaluationId, evaluationIds));
  for (const rating of ratings) {
    bucket(rating.evaluationId).ratings[rating.itemId] = rating.value;
  }

  const responses = await db
    .select({
      evaluationId: judgingEvaluationResponses.evaluationId,
      itemId: judgingEvaluationResponses.itemId,
      value: judgingEvaluationResponses.value,
      isPublic: judgingEvaluationResponses.isPublic,
    })
    .from(judgingEvaluationResponses)
    .where(inArray(judgingEvaluationResponses.evaluationId, evaluationIds));
  for (const response of responses) {
    bucket(response.evaluationId).responses[response.itemId] = {
      value: response.value,
      isPublic: response.isPublic,
    };
  }

  return answers;
}

export const modeOf = (challenges: readonly ChallengeRow[], challenge: ChallengeRow) =>
  effectiveMode(challenges, challenge.id) ?? challenge.mode;

/** The opted-in challenges of each entry a judge may see, as tags. */
export async function tagsOf(
  db: DrizzleDB,
  judge: Judge,
  challenges: readonly ChallengeRow[],
  entryIds: string[],
) {
  const tags = new Map<string, { id: string; label: string }[]>();
  if (entryIds.length === 0) return tags;

  const visible =
    judge.kind === "guest"
      ? guestScope(challenges, judge.roomChallengeId)
      : new Set(challenges.map((c) => c.id));
  const labelOf = new Map(challenges.map((c) => [c.id, c.label]));

  const rows = await db
    .select({
      entryId: judgingEntryChallenges.entryId,
      challengeId: judgingEntryChallenges.challengeId,
    })
    .from(judgingEntryChallenges)
    .where(
      and(
        inArray(judgingEntryChallenges.entryId, entryIds),
        eq(judgingEntryChallenges.isOptIn, true),
      ),
    );
  for (const row of rows) {
    if (!visible.has(row.challengeId)) continue;
    const list = tags.get(row.entryId) ?? [];
    list.push({
      id: row.challengeId,
      label: labelOf.get(row.challengeId) ?? "",
    });
    tags.set(row.entryId, list);
  }
  return tags;
}

/** The room or table a guest was let into, or the member's current seat. */
export async function roomSummary(
  db: DrizzleDB,
  roomId: string,
  challenges: readonly ChallengeRow[],
) {
  const [room] = await db
    .select({
      id: judgingRooms.id,
      name: judgingRooms.name,
      kind: judgingRooms.kind,
      buildingName: judgingBuildings.name,
      challengeId: judgingRooms.challengeId,
    })
    .from(judgingRooms)
    .leftJoin(
      judgingBuildings,
      eq(judgingBuildings.id, judgingRooms.buildingId),
    )
    .where(eq(judgingRooms.id, roomId))
    .limit(1);
  if (!room) return null;
  const challenge = challenges.find((c) => c.id === room.challengeId);
  return {
    ...room,
    challengeLabel: challenge?.label ?? "",
    mode: effectiveMode(challenges, room.challengeId) ?? "scheduled",
  };
}

/** The room a judge's open presence is in, archived or not. */
export async function openRoomId(db: DrizzleDB, judgeId: string) {
  const [seat] = await db
    .select({ roomId: judgingPresence.roomId })
    .from(judgingPresence)
    .where(
      and(eq(judgingPresence.judgeId, judgeId), isNull(judgingPresence.leftAt)),
    )
    .limit(1);
  return seat?.roomId ?? null;
}

/**
 * A member's seat, for the rule that a sponsor's challenge is graded from its
 * room. A guest is locked to their room's challenge and needs no seat.
 */
export function memberSeat(
  db: DrizzleDB,
  judge: Judge,
  challenges: readonly ChallengeRow[],
) {
  return judge.kind === "member"
    ? seatOf(db, judge.judgeId, challenges)
    : Promise.resolve(null);
}

/** The track a member judge asked for when they applied, or null. */
export async function preferredTrackOf(
  db: DrizzleDB,
  userId: string,
  hackathonId: string,
) {
  const [row] = await db
    .select({ track: judgeAssignments.track })
    .from(judgeAssignments)
    .innerJoin(judges, eq(judges.id, judgeAssignments.judgeId))
    .where(
      and(
        eq(judges.userId, userId),
        eq(judgeAssignments.hackathonId, hackathonId),
      ),
    )
    .limit(1);
  return row?.track ?? null;
}
