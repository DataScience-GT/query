import { and, eq } from "drizzle-orm";
import { isPastCutoff, phaseAllows, validateScores, weightedTotal } from "@query/judging-core";
import type { Criterion, Phase, ScoreInput, TimerConfig } from "@query/judging-core";
import type { PanelDb } from "@query/judging-db";
import {
  criterion,
  event,
  eventConfig,
  eventLog,
  outbox,
  rubric,
  track,
  visit,
  vote,
  voteScore,
} from "@query/judging-db";

export type VoteDecision =
  | { ok: true; total: number }
  | { ok: false; message: string };

/**
 * Whether this score can be stored. The cutoff message names the configured
 * hard limit so the phone can show the number the event actually used.
 */
export function assessVote(input: {
  phase: Phase;
  arrivedAt: Date | null;
  now: Date;
  config: TimerConfig;
  criteria: readonly Criterion[];
  scores: readonly ScoreInput[];
}): VoteDecision {
  if (!phaseAllows(input.phase, "vote")) {
    return {
      ok: false,
      message: `vote is not allowed while the event is ${input.phase}`,
    };
  }
  if (!input.arrivedAt) {
    return { ok: false, message: "Arrive at the table before scoring" };
  }
  if (isPastCutoff(input.arrivedAt, input.now, input.config)) {
    return {
      ok: false,
      message: `Vote is past the ${input.config.hardLimitSeconds}s hard limit`,
    };
  }
  const check = validateScores(input.criteria, input.scores);
  if (!check.ok) return { ok: false, message: check.reason };
  return { ok: true, total: weightedTotal(input.criteria, input.scores) };
}

export async function castVote(
  db: PanelDb,
  input: {
    eventId: string;
    judgeId: string;
    visitId: string;
    scores: readonly ScoreInput[];
    comment: string | null;
    now: Date;
  },
): Promise<{ total: number }> {
  return db.transaction(async (tx) => {
    const [evt] = await tx
      .select({ phase: event.phase })
      .from(event)
      .where(eq(event.id, input.eventId));
    const [config] = await tx
      .select()
      .from(eventConfig)
      .where(eq(eventConfig.eventId, input.eventId));
    const [row] = await tx
      .select()
      .from(visit)
      .where(and(eq(visit.id, input.visitId), eq(visit.judgeId, input.judgeId)));
    if (!evt || !config || !row) throw new Error("Visit not found");
    if (row.eventId !== input.eventId) throw new Error("Visit not found");
    if (row.voidedAt || row.completedAt) throw new Error("This visit is closed");

    const criteria = await loadCriteria(tx, input.eventId, row.judgeGroup);
    const decision = assessVote({
      phase: evt.phase,
      arrivedAt: row.arrivedAt,
      now: input.now,
      config: {
        targetSeconds: config.targetSeconds,
        hardLimitSeconds: config.hardLimitSeconds,
        walkLimitSeconds: config.walkLimitSeconds,
        submitGraceSeconds: config.submitGraceSeconds,
      },
      criteria,
      scores: input.scores,
    });
    if (!decision.ok) throw new Error(decision.message);

    const duration =
      row.arrivedAt === null
        ? null
        : Math.round((input.now.getTime() - row.arrivedAt.getTime()) / 1000);

    const [stored] = await tx
      .insert(vote)
      .values({
        visitId: row.id,
        judgeId: input.judgeId,
        projectId: row.projectId,
        eventId: input.eventId,
        total: decision.total,
        comment: input.comment,
        durationSeconds: duration,
        isCalibration: false,
      })
      .returning({ id: vote.id });
    if (!stored) throw new Error("Vote was not stored");

    if (input.scores.length > 0) {
      await tx.insert(voteScore).values(
        input.scores.map((score) => ({
          voteId: stored.id,
          criterionId: score.criterionId,
          value: score.value,
        })),
      );
    }
    await tx
      .update(visit)
      .set({ completedAt: input.now })
      .where(eq(visit.id, row.id));
    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "vote.cast",
      actor: { judgeId: input.judgeId },
      subject: { visitId: row.id, projectId: row.projectId },
      payload: { total: decision.total },
    });
    await tx.insert(outbox).values({
      eventId: input.eventId,
      topic: "vote.cast",
      payload: { visitId: row.id, judgeId: input.judgeId, total: decision.total },
    });
    return { total: decision.total };
  });
}

async function loadCriteria(
  tx: Parameters<Parameters<PanelDb["transaction"]>[0]>[0],
  eventId: string,
  judgeGroup: string,
): Promise<Criterion[]> {
  const [groupTrack] = await tx
    .select({ rubricId: track.rubricId })
    .from(track)
    .where(and(eq(track.eventId, eventId), eq(track.judgeGroup, judgeGroup)));
  const rubricId = groupTrack?.rubricId
    ? groupTrack.rubricId
    : (
        await tx
          .select({ id: rubric.id })
          .from(rubric)
          .where(and(eq(rubric.eventId, eventId), eq(rubric.isDefault, true)))
      )[0]?.id;
  if (!rubricId) return [];
  const rows = await tx
    .select()
    .from(criterion)
    .where(eq(criterion.rubricId, rubricId));
  return rows.map((row) => ({
    id: row.id,
    min: row.min,
    max: row.max,
    weight: row.weight,
  }));
}
