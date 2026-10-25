// The projects a judge can pick from, their itinerary, and one project for the editor.

import { z } from "zod";
import { and, asc, eq, gt, ilike, inArray, isNull } from "drizzle-orm";
import {
  judgingAppointments,
  judgingBuildings,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingRooms,
  judgingSchedules,
} from "@query/db";
import { flaggedEntryIds } from "../../../services/check-in-flags";
import { rebalanceIfDue } from "../schedule";
import {
  evaluatedChallenge,
  evaluationAccess,
  judgingSwitches,
  loadChallenges,
  loadEntryInChallenge,
  loadRubric,
  reconcileDueDrafts,
  seatOf,
} from "../../../services/judging/evaluation-store";
import {
  reservedUntil as reservedUntilOf,
} from "../../../services/judging/timing";
import {
  gradingRefusal,
  gradingStateOf,
  gradingStates,
} from "../../../services/judging/grading-hold";
import type { GradingState } from "../../../services/judging/grading-hold";
import { queueOrder } from "../../../services/judging/queue";
import { responseVisibility } from "../../../services/judging/evaluation";
import {
  evaluationScore,
  hasEveryRating,
  overallScore,
  scopedScore,
} from "../../../services/judging/scoring";
import { holdsEveryRating } from "../../../services/judging/scoring-sql";
import {
  judgeProcedure,
  uuid,
  escapeLike,
  NOT_OPEN_YET,
  CLOSED,
  taskOf,
  answersOf,
  modeOf,
  tagsOf,
  roomSummary,
} from "./shared";

export const projectProcedures = {
  // The projects to judge for one challenge. By default: in presentation
  // order, only those presenting in the judge's room, not yet judged by them.
  // Each says whether it is still open to grade: a project is graded once, so
  // one another judge graded or holds is listed after the open ones, as is
  // one still reserved for the judge assigned to it, with when it opens.
  // Presentations assigned to this judge come first, marked as theirs.
  projects: judgeProcedure
    .input(
      z.object({
        challengeId: uuid.optional(),
        search: z.string().trim().max(100).optional(),
        hideJudged: z.boolean().default(true),
        inMyRoomOnly: z.boolean().default(true),
        sort: z.enum(["scheduled", "title"]).default("scheduled"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const seat = await seatOf(db, judge.judgeId, challenges);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        seat,
      );
      const mode = modeOf(challenges, challenge);
      const [schedule] = await db
        .select({
          id: judgingSchedules.id,
          setupMinutes: judgingSchedules.setupMinutes,
          judgingMinutes: judgingSchedules.judgingMinutes,
        })
        .from(judgingSchedules)
        .where(eq(judgingSchedules.hackathonId, input.hackathonId))
        .limit(1);

      // Why the room filter is or is not applied, so the desk can say so.
      const roomFilter = !input.inMyRoomOnly
        ? ("off" as const)
        : !schedule || mode !== "scheduled"
          ? ("untimed" as const)
          : !seat || seat.challengeId !== challenge.id
            ? ("no-room" as const)
            : ("applied" as const);

      const entries = await db
        .select({
          id: judgingEntries.id,
          title: judgingEntries.title,
          participantCount: judgingEntries.participantCount,
        })
        .from(judgingEntries)
        .innerJoin(
          judgingEntryChallenges,
          and(
            eq(judgingEntryChallenges.entryId, judgingEntries.id),
            eq(
              judgingEntryChallenges.challengeId,
              input.challengeId ?? challenge.id,
            ),
          ),
        )
        .where(
          and(
            eq(judgingEntries.hackathonId, input.hackathonId),
            isNull(judgingEntries.deletedAt),
            input.search
              ? ilike(judgingEntries.title, `%${escapeLike(input.search)}%`)
              : undefined,
          ),
        );

      const base = {
        challenge: {
          id: challenge.id,
          label: challenge.label,
          mode,
        },
        roomFilter,
        serverNow: new Date(),
      };
      if (entries.length === 0) {
        return { ...base, judgedCount: 0, projects: [] };
      }
      const entryIds = entries.map((entry) => entry.id);

      const presentations = schedule
        ? await db
            .select({
              id: judgingAppointments.id,
              entryId: judgingAppointments.entryId,
              roomId: judgingAppointments.roomId,
              roomName: judgingRooms.name,
              buildingName: judgingBuildings.name,
              startsAt: judgingAppointments.startsAt,
              deadlineAt: judgingAppointments.deadlineAt,
              endsAt: judgingAppointments.endsAt,
              assignedJudgeId: judgingAppointments.assignedJudgeId,
            })
            .from(judgingAppointments)
            .innerJoin(
              judgingRooms,
              eq(judgingRooms.id, judgingAppointments.roomId),
            )
            .leftJoin(
              judgingBuildings,
              eq(judgingBuildings.id, judgingRooms.buildingId),
            )
            .where(
              and(
                eq(judgingAppointments.scheduleId, schedule.id),
                eq(judgingAppointments.challengeId, challenge.id),
                inArray(judgingAppointments.entryId, entryIds),
              ),
            )
        : [];
      // Every judge's, to tell which projects someone has: a judge is only
      // ever shown their own.
      const evaluations = await db
        .select({
          entryId: judgingEvaluations.entryId,
          judgeId: judgingEvaluations.judgeId,
          revision: judgingEvaluations.revision,
          // Every rating in, as placings count it.
          counted: holdsEveryRating(input.hackathonId),
        })
        .from(judgingEvaluations)
        .where(
          and(
            eq(judgingEvaluations.challengeId, challenge.id),
            inArray(judgingEvaluations.entryId, entryIds),
          ),
        );
      const drafts = await db
        .select({
          entryId: judgingEvaluationDrafts.entryId,
          judgeId: judgingEvaluationDrafts.judgeId,
          updatedAt: judgingEvaluationDrafts.updatedAt,
          deadlineAt: judgingEvaluationDrafts.deadlineAt,
          revision: judgingEvaluationDrafts.revision,
        })
        .from(judgingEvaluationDrafts)
        .where(
          and(
            eq(judgingEvaluationDrafts.challengeId, challenge.id),
            inArray(judgingEvaluationDrafts.entryId, entryIds),
          ),
        );
      const tags = await tagsOf(db, judge, challenges, entryIds);
      // One yes or no per project and nothing else. Who was flagged and why
      // is for organisers; this list is polled by every judge, guests included.
      const flagged = await flaggedEntryIds(db, input.hackathonId, entryIds);

      const presentationOf = new Map(presentations.map((p) => [p.entryId, p]));
      const evaluationOf = new Map(
        evaluations
          .filter((e) => e.judgeId === judge.judgeId)
          .map((e) => [e.entryId, e]),
      );
      // A draft the judge has saved to. Opening a project makes an empty one
      // (startGrading), and that is not a draft saved.
      const drafted = new Set(
        drafts
          .filter((d) => d.judgeId === judge.judgeId && d.revision > 0)
          .map((d) => d.entryId),
      );
      // A scheduled challenge's presentation assigned to another judge is kept
      // for them until its takeover time. Never says which judge.
      const now = new Date();
      const timed = !!schedule && mode === "scheduled";
      const reserved = new Map<string, Date>();
      if (timed) {
        for (const presentation of presentations) {
          const until = reservedUntilOf(
            { ...presentation, slot: schedule },
            judge.judgeId,
            now,
          );
          if (until) reserved.set(presentation.entryId, until);
        }
      }
      const grading = gradingStates(
        judge.judgeId,
        entryIds,
        evaluations,
        drafts,
        now,
        reserved,
      );

      const inView = entries.filter(
        (entry) =>
          !(
            roomFilter === "applied" &&
            presentationOf.get(entry.id)?.roomId !== seat?.roomId
          ),
      );
      // Judged means the evaluation counts, as placings count it: every rating
      // in, written response or not. One missing a rating is not hidden.
      const judgedCount = inView.filter(
        (entry) => evaluationOf.get(entry.id)?.counted,
      ).length;

      const projects = inView
        .filter(
          (entry) => !(input.hideJudged && evaluationOf.get(entry.id)?.counted),
        )
        .map((entry) => {
          const presentation = presentationOf.get(entry.id);
          const evaluation = evaluationOf.get(entry.id);
          return {
            ...entry,
            challenges: tags.get(entry.id) ?? [],
            flagged: flagged.has(entry.id),
            presentation: presentation
              ? {
                  id: presentation.id,
                  roomId: presentation.roomId,
                  roomName: presentation.roomName,
                  buildingName: presentation.buildingName,
                  startsAt: presentation.startsAt,
                  deadlineAt: presentation.deadlineAt,
                  endsAt: presentation.endsAt,
                }
              : null,
            myEvaluation: evaluation
              ? {
                  revision: evaluation.revision,
                  counted: evaluation.counted,
                }
              : null,
            hasDraft: drafted.has(entry.id),
            grading: grading.get(entry.id) ?? ("open" as const),
            // When a reserved project opens to this judge.
            reservedUntil:
              grading.get(entry.id) === "reserved"
                ? (reserved.get(entry.id) ?? null)
                : null,
            assignedToYou:
              timed && presentation?.assignedJudgeId === judge.judgeId,
          };
        });

      // What the judge can still do comes first, then projects another judge
      // is grading or is assigned, then those another judge graded.
      const standing = (state: GradingState) =>
        state === "graded"
          ? 2
          : state === "in_progress" || state === "reserved"
            ? 1
            : 0;
      const byTitle = (a: { title: string }, b: { title: string }) =>
        a.title.localeCompare(b.title);
      // Nothing is timed here, so open projects follow the judge's own queue,
      // the order Grade next project walks: the natural pick is the fair one.
      const queued =
        input.sort === "scheduled" && (!schedule || mode !== "scheduled")
          ? new Map(
              queueOrder(
                judge.judgeId,
                challenge.id,
                projects.filter((p) => p.grading === "open").map((p) => p.id),
              ).map((id, place) => [id, place]),
            )
          : null;
      projects.sort((a, b) => {
        const open = standing(a.grading) - standing(b.grading);
        if (open !== 0) return open;
        if (queued) {
          // The judge's own come first, then the open ones in queue order.
          const mine =
            Number(b.grading === "mine") - Number(a.grading === "mine");
          if (mine !== 0) return mine;
          const at = queued.get(a.id);
          const bt = queued.get(b.id);
          if (at !== undefined && bt !== undefined) return at - bt;
        } else if (input.sort === "scheduled") {
          // Their own assigned presentations lead, in start order.
          const assigned = Number(b.assignedToYou) - Number(a.assignedToYou);
          if (assigned !== 0) return assigned;
          const at = a.presentation?.startsAt.getTime() ?? Infinity;
          const bt = b.presentation?.startsAt.getTime() ?? Infinity;
          if (at !== bt) return at - bt;
        }
        return byTitle(a, b);
      });

      return { ...base, judgedCount, projects };
    }),

  // The presentations assigned to this judge that have not ended, soonest
  // first: what they are to judge and where to go for it. Only the judge's
  // own; whether another judge graded or took one over is told without saying
  // who. A project has no table of its own here: a table is a room whose kind
  // says so.
  itinerary: judgeProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    const { judge } = ctx;
    await reconcileDueDrafts(db, input.hackathonId);
    await rebalanceIfDue(db, input.hackathonId);

    const now = new Date();
    const [schedule] = await db
      .select({ id: judgingSchedules.id })
      .from(judgingSchedules)
      .where(eq(judgingSchedules.hackathonId, input.hackathonId))
      .limit(1);
    if (!schedule) return { presentations: [], serverNow: now };

    const rows = await db
      .select({
        id: judgingAppointments.id,
        entryId: judgingAppointments.entryId,
        challengeId: judgingAppointments.challengeId,
        title: judgingEntries.title,
        roomId: judgingRooms.id,
        roomName: judgingRooms.name,
        roomKind: judgingRooms.kind,
        buildingName: judgingBuildings.name,
        startsAt: judgingAppointments.startsAt,
        deadlineAt: judgingAppointments.deadlineAt,
      })
      .from(judgingAppointments)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingAppointments.entryId),
      )
      .innerJoin(judgingRooms, eq(judgingRooms.id, judgingAppointments.roomId))
      .leftJoin(
        judgingBuildings,
        eq(judgingBuildings.id, judgingRooms.buildingId),
      )
      .where(
        and(
          eq(judgingAppointments.scheduleId, schedule.id),
          eq(judgingAppointments.assignedJudgeId, judge.judgeId),
          gt(judgingAppointments.deadlineAt, now),
          isNull(judgingEntries.deletedAt),
        ),
      )
      .orderBy(asc(judgingAppointments.startsAt));
    if (rows.length === 0) return { presentations: [], serverNow: now };

    const challenges = await loadChallenges(db, input.hackathonId);
    const labelOf = new Map(challenges.map((c) => [c.id, c.label]));
    const roomId =
      judge.kind === "guest"
        ? judge.roomId
        : ((await seatOf(db, judge.judgeId, challenges))?.roomId ?? null);

    const entryIds = [...new Set(rows.map((row) => row.entryId))];
    const evaluations = await db
      .select({
        entryId: judgingEvaluations.entryId,
        challengeId: judgingEvaluations.challengeId,
        judgeId: judgingEvaluations.judgeId,
      })
      .from(judgingEvaluations)
      .where(inArray(judgingEvaluations.entryId, entryIds));
    const drafts = await db
      .select({
        entryId: judgingEvaluationDrafts.entryId,
        challengeId: judgingEvaluationDrafts.challengeId,
        judgeId: judgingEvaluationDrafts.judgeId,
        updatedAt: judgingEvaluationDrafts.updatedAt,
        deadlineAt: judgingEvaluationDrafts.deadlineAt,
      })
      .from(judgingEvaluationDrafts)
      .where(inArray(judgingEvaluationDrafts.entryId, entryIds));

    return {
      presentations: rows.map((row) => {
        const same = (task: { entryId: string; challengeId: string }) =>
          task.entryId === row.entryId && task.challengeId === row.challengeId;
        const graders = evaluations.filter(same);
        return {
          ...row,
          challengeLabel: labelOf.get(row.challengeId) ?? "",
          // Graded by anyone: nothing is left to do for it.
          graded: graders.length > 0,
          // Another judge started it after the takeover time.
          takenOver:
            gradingStateOf(judge.judgeId, graders, drafts.filter(same), now) ===
            "in_progress",
          inRoom: row.roomId === roomId,
        };
      }),
      serverNow: now,
    };
  }),

  // One project as the evaluation editor needs it: the project (names only
  // for the team), the rubric, the judge's draft or evaluation, whether they
  // can write now and against what deadline, and scores once they may see
  // them.
  project: judgeProcedure
    .input(z.object({ entryId: uuid, challengeId: uuid.optional() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const seat = await seatOf(db, judge.judgeId, challenges);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        seat,
      );
      const entry = await loadEntryInChallenge(db, {
        hackathonId: input.hackathonId,
        entryId: input.entryId,
        challenge,
      });

      const members = await db
        .select({ name: judgingEntryMembers.name })
        .from(judgingEntryMembers)
        .where(eq(judgingEntryMembers.entryId, entry.id))
        .orderBy(
          asc(judgingEntryMembers.displayOrder),
          asc(judgingEntryMembers.createdAt),
        );
      const tags = await tagsOf(db, judge, challenges, [entry.id]);
      // A bare marker, as in the project list: never who or why.
      const flagged = await flaggedEntryIds(db, input.hackathonId, [entry.id]);
      const rubric = await loadRubric(db, input.hackathonId);
      const switches = await judgingSwitches(db, input.hackathonId);

      const [evaluation] = await db
        .select({
          id: judgingEvaluations.id,
          revision: judgingEvaluations.revision,
          isComplete: judgingEvaluations.isComplete,
          appointmentId: judgingEvaluations.appointmentId,
          submittedAt: judgingEvaluations.submittedAt,
          autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
          updatedAt: judgingEvaluations.updatedAt,
        })
        .from(judgingEvaluations)
        .where(
          taskOf(judgingEvaluations, judge.judgeId, entry.id, challenge.id),
        )
        .limit(1);
      const [draft] = await db
        .select({
          ratings: judgingEvaluationDrafts.ratings,
          responses: judgingEvaluationDrafts.responses,
          revision: judgingEvaluationDrafts.revision,
          deadlineAt: judgingEvaluationDrafts.deadlineAt,
          updatedAt: judgingEvaluationDrafts.updatedAt,
        })
        .from(judgingEvaluationDrafts)
        .where(
          taskOf(
            judgingEvaluationDrafts,
            judge.judgeId,
            entry.id,
            challenge.id,
          ),
        )
        .limit(1);

      // Every judge's, narrowed to what says who has the project.
      const graders = await db
        .select({ judgeId: judgingEvaluations.judgeId })
        .from(judgingEvaluations)
        .where(
          and(
            eq(judgingEvaluations.entryId, entry.id),
            eq(judgingEvaluations.challengeId, challenge.id),
          ),
        );
      const holders = await db
        .select({
          judgeId: judgingEvaluationDrafts.judgeId,
          updatedAt: judgingEvaluationDrafts.updatedAt,
          deadlineAt: judgingEvaluationDrafts.deadlineAt,
        })
        .from(judgingEvaluationDrafts)
        .where(
          and(
            eq(judgingEvaluationDrafts.entryId, entry.id),
            eq(judgingEvaluationDrafts.challengeId, challenge.id),
          ),
        );
      const { timing, presentation, reservedUntil } = await evaluationAccess(
        db,
        {
          hackathonId: input.hackathonId,
          judgeId: judge.judgeId,
          entryId: entry.id,
          challenge,
          challenges,
          evaluation: evaluation ?? null,
        },
      );
      const grading = gradingStateOf(
        judge.judgeId,
        graders,
        holders,
        new Date(),
        reservedUntil,
      );
      // Another judge's project stays readable; it cannot be written to.
      // One reserved for another judge is shut by the timing, which says when
      // it opens.
      const gradedElsewhere = gradingRefusal(grading, challenge.label);
      const presentationRoom = presentation
        ? await roomSummary(db, presentation.roomId, challenges)
        : null;

      // An evaluation counts once it rated every rating item, as placings
      // count it: a draft submitted at the deadline with a response left
      // empty still does.
      const ratingItems = rubric.filter(
        (item) => item.kind === "rating",
      ).length;

      // A judge sees how a project is scoring once they have judged it
      // themselves, or (members only) when organisers show every score.
      // Guests never see the overall score across challenges.
      const scoresVisible =
        !!evaluation || (judge.kind === "member" && switches.showAllScores);
      let scores: {
        challenge: ReturnType<typeof scopedScore>;
        overall: ReturnType<typeof overallScore> | null;
      } | null = null;
      if (scoresVisible) {
        const submitted = await db
          .select({
            id: judgingEvaluations.id,
            challengeId: judgingEvaluations.challengeId,
          })
          .from(judgingEvaluations)
          .where(eq(judgingEvaluations.entryId, entry.id));
        const answers = await answersOf(
          db,
          submitted.map((e) => e.id),
        );
        const scored = submitted.map((e) => {
          const ratings = Object.values(answers.get(e.id)?.ratings ?? {});
          return {
            challengeId: e.challengeId,
            ratingsComplete: hasEveryRating(ratings, ratingItems),
            ratings,
          };
        });
        scores = {
          challenge: scopedScore(scored, challenge.id),
          overall: judge.kind === "member" ? overallScore(scored) : null,
        };
      }

      const mine = evaluation
        ? (await answersOf(db, [evaluation.id])).get(evaluation.id)
        : undefined;
      const open = switches.state === "open";

      return {
        entry: {
          ...entry,
          members: members.map((member) => member.name),
          challenges: tags.get(entry.id) ?? [],
          flagged: flagged.has(entry.id),
        },
        challenge: {
          id: challenge.id,
          label: challenge.label,
          mode: modeOf(challenges, challenge),
        },
        rubric: rubric.map((item) => ({
          id: item.id,
          kind: item.kind,
          label: item.label,
          description: item.description,
          required: item.kind === "rating" || item.required,
          // Who will read this judge's answer: the team, the judge's choice,
          // or organisers only.
          visibility:
            item.kind === "response"
              ? responseVisibility(item, judge.kind)
              : null,
        })),
        evaluation: evaluation
          ? {
              id: evaluation.id,
              revision: evaluation.revision,
              isComplete: evaluation.isComplete,
              submittedAt: evaluation.submittedAt,
              autoSubmittedAt: evaluation.autoSubmittedAt,
              updatedAt: evaluation.updatedAt,
              ratings: mine?.ratings ?? {},
              responses: mine?.responses ?? {},
              score: hasEveryRating(
                Object.values(mine?.ratings ?? {}),
                ratingItems,
              )
                ? evaluationScore(Object.values(mine?.ratings ?? {}))
                : null,
            }
          : null,
        draft: draft ?? null,
        // Where the project stands for this judge: theirs, graded by another
        // judge, being graded by one, reserved for the judge assigned to it,
        // or open. Never which judge.
        grading,
        access: {
          judgingState: switches.state,
          canEdit: open && timing.canEdit && !gradedElsewhere,
          reason: !open
            ? switches.state === "closed"
              ? CLOSED
              : NOT_OPEN_YET
            : (gradedElsewhere ?? (timing.canEdit ? null : timing.reason)),
          // Shut because another judge graded the project or is grading it.
          gradedElsewhere: gradedElsewhere !== null,
          deadlineAt:
            timing.canEdit && !gradedElsewhere ? timing.deadlineAt : null,
          opensAt: timing.canEdit || gradedElsewhere ? null : timing.opensAt,
          // Shut because the presentation's deadline passed: scores are final.
          ended: open && !gradedElsewhere && !timing.canEdit && timing.ended,
          // Shut only because the judge is not in the room that serves this
          // challenge: a slot exists and has no start to wait for.
          needsRoom:
            open &&
            !gradedElsewhere &&
            !timing.canEdit &&
            !timing.opensAt &&
            !timing.ended &&
            presentation !== null,
        },
        presentation:
          presentation && presentationRoom
            ? {
                startsAt: presentation.startsAt,
                deadlineAt: presentation.deadlineAt,
                endsAt: presentation.endsAt,
                roomName: presentationRoom.name,
                buildingName: presentationRoom.buildingName,
              }
            : null,
        scores,
        serverNow: new Date(),
      };
    }),
};
