import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingGuestSessions,
  judgingJudges,
  judgingPresence,
  judgingRooms,
  judgingSchedules,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { isAdmin, isAdminUpload } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import {
  assertHackathonExists,
  ensureJudgingConfig,
} from "../../services/judging/config";
import type { JudgingDb } from "../../services/judging/config";
import { rootOf } from "../../services/judging/scope";
import {
  candidateKey,
  planFingerprint,
  planInputs,
  selectPlan,
  taskKey,
} from "../../services/judging/schedule/inputs";
import type {
  PlanDiagnostic,
  PlanResult,
} from "../../services/judging/schedule/solve";
import { adviceFor, slotsNeeded } from "../../services/judging/schedule/advice";
import type { AdviceRoom } from "../../services/judging/schedule/advice";
import { aamoghCPSolver } from "../../services/judging/schedule/aamogh-cp-solver";
import {
  CPSAT_COMMAND,
  cpsatAssignmentProblem,
  cpsatProblem,
  readCpsatAssignments,
  readCpsatSolution,
} from "../../services/judging/schedule/cpsat-bridge";
import {
  assignJudges,
  describeShortfall,
  judgeShortfalls,
  mayGrade,
  roomsJudgesCanStaff,
} from "../../services/judging/schedule/judges";
import type {
  JudgeAssignment,
  JudgeInput,
} from "../../services/judging/schedule/judges";
import {
  judgeChanges,
  judgeChoices,
  judgePlanOf,
  rosterOf,
} from "../../services/judging/schedule/judge-plan";
import type {
  Roster,
  SavedAppointment,
} from "../../services/judging/schedule/judge-plan";
import {
  CPSAT_SECONDS,
  CPSAT_UNAVAILABLE,
  cpsatAvailable,
  runCpsat,
} from "../../services/judging/schedule/cpsat-runner";
import { reconcileDueDrafts } from "../../services/judging/evaluation-store";
import { holdsEveryRating } from "../../services/judging/scoring-sql";
import { moveChoices } from "../../services/judging/schedule/moves";
import {
  absentJudgeIds,
  LATE_WITHIN_MS,
  rebalancePlan,
  receiverIds,
} from "../../services/judging/schedule/rebalance";
import {
  staffedRoomIds,
  withStatus,
} from "../../services/judging/schedule/board";
import { judgeProgressById } from "../../services/judging/schedule/judge-progress";
import type { JudgeProgress } from "../../services/judging/schedule/judge-progress";
import {
  MAX_SLOTS,
  appointmentTimes,
  firstSlotFrom,
  gridOf,
  slotAt,
  slotMinutes,
  slotStartsAt,
  timingProblems,
} from "../../services/judging/schedule/slots";
import type { ScheduleTiming } from "../../services/judging/schedule/slots";
import type { Placement, PlanInputs } from "../../services/judging/schedule/inputs";

// Building, saving and adjusting the presentation schedule. The solver and
// its rules live in services/judging/schedule as pure code; this file reads
// the inventory, puts the outcome into words and writes appointments. None
// of these reads are cached: the board is polled while judging runs.

const uuid = z.string().uuid();

const timingInput = z
  .object({
    windowStart: z.date(),
    windowEnd: z.date(),
    setupMinutes: z.number().int().min(0).max(120).default(2),
    judgingMinutes: z.number().int().min(1).max(240).default(6),
    teardownMinutes: z.number().int().min(0).max(120).default(2),
    sameBuildingBreakMinutes: z.number().int().min(0).max(720).default(10),
    crossBuildingBreakMinutes: z.number().int().min(0).max(720).default(20),
  })
  .superRefine((timing, ctx) => {
    for (const message of timingProblems(timing)) {
      ctx.addIssue({ code: "custom", message, path: ["windowEnd"] });
    }
  });

// The minutes the timing form starts with; the same defaults as above.
const DEFAULT_MINUTES = {
  setupMinutes: 2,
  judgingMinutes: 6,
  teardownMinutes: 2,
  sameBuildingBreakMinutes: 10,
  crossBuildingBreakMinutes: 20,
};

const QUARTER_HOUR = 15 * 60_000;

/** Most tables solveInventory leaves out beyond what the judges can staff. */
const MAX_EXTRA_DROPPED = 3;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function assertWindowAhead(timing: ScheduleTiming) {
  if (timing.windowStart <= new Date()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "The judging window has already started. Pick a start time in the future.",
    });
  }
}

function timingOf(row: typeof judgingSchedules.$inferSelect): ScheduleTiming {
  return {
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    setupMinutes: row.setupMinutes,
    judgingMinutes: row.judgingMinutes,
    teardownMinutes: row.teardownMinutes,
    sameBuildingBreakMinutes: row.sameBuildingBreakMinutes,
    crossBuildingBreakMinutes: row.crossBuildingBreakMinutes,
  };
}

async function findSchedule(db: JudgingDb, hackathonId: string, lock = false) {
  const query = db
    .select()
    .from(judgingSchedules)
    .where(eq(judgingSchedules.hackathonId, hackathonId));
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

/** Challenges, every room (archived too, for the buildings of old bookings) and entries. */
async function readInventory(db: JudgingDb, hackathonId: string) {
  const [challenges, rooms, memberships] = await Promise.all([
    db
      .select({
        id: judgingChallenges.id,
        label: judgingChallenges.label,
        parentId: judgingChallenges.parentId,
        mode: judgingChallenges.mode,
        isGeneral: judgingChallenges.isGeneral,
        isGroup: judgingChallenges.isGroup,
      })
      .from(judgingChallenges)
      .where(eq(judgingChallenges.hackathonId, hackathonId)),
    db
      .select({
        id: judgingRooms.id,
        name: judgingRooms.name,
        kind: judgingRooms.kind,
        challengeId: judgingRooms.challengeId,
        buildingId: judgingRooms.buildingId,
        buildingName: judgingBuildings.name,
        archivedAt: judgingRooms.archivedAt,
      })
      .from(judgingRooms)
      .leftJoin(judgingBuildings, eq(judgingBuildings.id, judgingRooms.buildingId))
      .where(eq(judgingRooms.hackathonId, hackathonId))
      .orderBy(asc(judgingRooms.displayOrder), asc(judgingRooms.name)),
    db
      .select({
        entryId: judgingEntryChallenges.entryId,
        challengeId: judgingEntryChallenges.challengeId,
        title: judgingEntries.title,
      })
      .from(judgingEntryChallenges)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingEntryChallenges.entryId),
      )
      .where(
        and(
          eq(judgingEntryChallenges.hackathonId, hackathonId),
          isNull(judgingEntries.deletedAt),
        ),
      ),
  ]);
  return { challenges, rooms, memberships };
}

type Inventory = Awaited<ReturnType<typeof readInventory>>;

/**
 * The judges an edition can give presentations to, with every judge's name.
 * A guest whose session has run out is not here: they are off the roster, so
 * nothing is handed to them and what they hold is given again.
 */
async function readRoster(
  db: JudgingDb,
  hackathonId: string,
  inventory: Inventory,
  now: Date,
): Promise<Roster> {
  const [judges, sessions] = await Promise.all([
    db
      .select({
        id: judgingJudges.id,
        kind: judgingJudges.kind,
        userId: judgingJudges.userId,
        displayName: judgingJudges.displayName,
      })
      .from(judgingJudges)
      .where(eq(judgingJudges.hackathonId, hackathonId)),
    db
      .select({
        judgeId: judgingGuestSessions.judgeId,
        roomId: judgingGuestSessions.roomId,
        createdAt: judgingGuestSessions.createdAt,
        expiresAt: judgingGuestSessions.expiresAt,
      })
      .from(judgingGuestSessions)
      .where(
        and(
          eq(judgingGuestSessions.hackathonId, hackathonId),
          isNull(judgingGuestSessions.revokedAt),
        ),
      ),
  ]);
  return rosterOf({
    hackathonId,
    judges,
    seats: sessions.flatMap((s) =>
      s.judgeId && s.expiresAt > now
        ? [{ judgeId: s.judgeId, roomId: s.roomId, createdAt: s.createdAt }]
        : [],
    ),
    challenges: inventory.challenges,
    rooms: selectPlan(inventory).rooms,
  });
}

function namesOf(inventory: Inventory) {
  const labels = new Map(inventory.challenges.map((c) => [c.id, c.label]));
  const titles = new Map(inventory.memberships.map((m) => [m.entryId, m.title]));
  const rooms = new Map(inventory.rooms.map((r) => [r.id, r]));
  return {
    label: (id: string) => labels.get(id) ?? "Removed challenge",
    title: (id: string) => titles.get(id) ?? "Removed project",
    room: (id: string) => ({
      roomName: rooms.get(id)?.name ?? "Removed room or table",
      buildingName: rooms.get(id)?.buildingName ?? null,
    }),
    /** How many of these rooms are tables. */
    tables: (planned: readonly { id: string }[]) =>
      planned.filter((r) => rooms.get(r.id)?.kind === "table").length,
  };
}

/** The solver's diagnostics as sentences an organiser can act on. */
function explain(
  diagnostics: PlanDiagnostic[],
  names: ReturnType<typeof namesOf>,
): string[] {
  const sentences: string[] = [];
  const leftOver: string[] = [];

  for (const d of diagnostics) {
    if (d.kind === "capacity" && d.rooms === 0) {
      sentences.push(
        `"${names.label(d.challengeId)}" has ${plural(d.presentations, "presentation")} but no room or table in a building. Add one for it, or judge it unscheduled.`,
      );
    } else if (d.kind === "capacity") {
      sentences.push(
        `"${names.label(d.challengeId)}" has ${plural(d.presentations, "presentation")} but its ${plural(d.rooms, "room or table", "rooms or tables")} hold ${d.capacity} in this window. Add a room or table, lengthen the window or shorten the presentations.`,
      );
    } else if (d.kind === "overload") {
      sentences.push(
        `"${names.title(d.entryId)}" presents ${plural(d.presentations, "time")}, which takes ${d.slotsNeeded} slots with breaks; the window has ${d.slots}. Lengthen the window or shorten the breaks.`,
      );
    } else {
      leftOver.push(`"${names.title(d.entryId)}" for ${names.label(d.challengeId)}`);
    }
  }

  if (leftOver.length > 0) {
    const shown = leftOver.slice(0, 5).join(", ");
    const more = leftOver.length > 5 ? ` and ${leftOver.length - 5} more` : "";
    sentences.push(
      `No schedule fits every presentation, even with shorter breaks between buildings. Left over: ${shown}${more}. Lengthen the window, add rooms or tables, or shorten the breaks.`,
    );
  }
  return sentences;
}

/** The solver's inputs and fingerprint for the edition as it stands. */
function planOf(inventory: Inventory, timing: ScheduleTiming) {
  const plan = selectPlan(inventory);
  if (plan.tasks.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No project is entered in a scheduled challenge yet. Import or promote projects, then build the schedule.",
    });
  }
  return {
    inputs: planInputs(plan, timing),
    fingerprint: planFingerprint(plan, timing),
  };
}

/**
 * Solves the edition as it stands for one timing, with aamoghCPSolver. Given
 * `judges`, it schedules only the tables they can staff at once, so
 * presentations spread over the day instead of waiting for a judge, and
 * falls back to every table when that cannot fit them all.
 */
function solveInventory(
  inventory: Inventory,
  timing: ScheduleTiming,
  judges?: readonly JudgeInput[],
) {
  const { inputs: every, fingerprint } = planOf(inventory, timing);
  const solve = () => {
    if (judges) {
      const names = namesOf(inventory);
      const members = judges.some((j) => j.kind === "member");
      let best: {
        inputs: PlanInputs;
        result: ReturnType<typeof aamoghCPSolver>;
        unjudged: number;
      } | null = null;
      let last = every.rooms.length;
      // Filling every seat exactly can still leave a few presentations
      // without a judge, so leave out up to MAX_EXTRA_DROPPED more tables
      // for full coverage, or the fewest unjudged.
      for (let extra = 0; extra <= (members ? MAX_EXTRA_DROPPED : 0); extra += 1) {
        const rooms = roomsJudgesCanStaff(
          every,
          judges,
          (a, b) =>
            names
              .room(a.id)
              .roomName.localeCompare(names.room(b.id).roomName, "en", {
                numeric: true,
              }),
          extra,
        );
        if (extra > 0 && rooms.length === last) break;
        last = rooms.length;
        const tried = rooms.length < every.rooms.length ? { ...every, rooms } : every;
        const result = aamoghCPSolver(tried);
        if (!result.ok) {
          if (tried === every) return { inputs: every, result };
          break;
        }
        const unjudged = members
          ? tried.tasks.length -
            assignJudges(tried, result.placements, judges).assignment.length
          : 0;
        if (!best || unjudged < best.unjudged) {
          best = { inputs: tried, result, unjudged };
        }
        if (unjudged === 0) break;
      }
      if (best) return best;
    }
    return { inputs: every, result: aamoghCPSolver(every) };
  };
  const { inputs, result } = solve();
  return {
    inputs,
    result,
    // Tables left out because the judges cannot staff them all at once.
    roomsLeftOut: every.rooms.length - inputs.rooms.length,
    fingerprint,
    // Which of the first four goals no schedule can beat (from the solver's
    // counting bounds), so the preview can say so.
    proven: {
      sponsorsDone: result.stats.proven[0] ?? false,
      sponsorRoomIdle: result.stats.proven[1] ?? false,
      allDone: result.stats.proven[2] ?? false,
      buildingChanges: result.stats.proven[3] ?? false,
    },
    key: result.ok
      ? candidateKey(fingerprint, result.relaxed, result.placements)
      : null,
  };
}

/** What the organiser could change to improve this solve, in words. */
function adviceOf(
  inventory: Inventory,
  roster: Roster,
  solved: ReturnType<typeof solveInventory>,
  timing: ScheduleTiming,
) {
  const names = namesOf(inventory);
  const rooms = new Map(inventory.rooms.map((r) => [r.id, r]));
  const planned: AdviceRoom[] = selectPlan(inventory).rooms.map((room) => ({
    ...room,
    name: rooms.get(room.id)?.name ?? "",
    table: rooms.get(room.id)?.kind === "table",
  }));
  return adviceFor({
    inputs: solved.inputs,
    result: solved.result,
    rooms: planned,
    judges: roster.judges,
    labelOf: names.label,
    slotMinutes: slotMinutes(timing),
  });
}

/** A solved schedule as the preview shows it. */
function describePlan(
  result: Extract<PlanResult, { ok: true }>,
  inputs: PlanInputs,
  names: ReturnType<typeof namesOf>,
  timing: ScheduleTiming,
  roomsLeftOut = 0,
) {
  const minutes = slotMinutes(timing);
  const [sponsorEnd, sponsorIdle, allEnd, changes, lessBreaks] = result.score;
  return {
    slots: inputs.slots,
    slotMinutes: minutes,
    presentations: inputs.tasks.length,
    projects: new Set(inputs.tasks.map((t) => t.entryId)).size,
    rooms: inputs.rooms.length,
    tables: names.tables(inputs.rooms),
    roomsLeftOut,
    ok: true as const,
    relaxed: result.relaxed,
    diagnostics: [] as string[],
    summary: {
      sponsorsDoneAt: sponsorEnd > 0 ? slotStartsAt(timing, sponsorEnd) : null,
      allDoneAt: allEnd > 0 ? slotStartsAt(timing, allEnd) : null,
      sponsorRoomIdleMinutes: sponsorIdle * minutes,
      buildingChanges: changes,
      breakMinutes: Math.abs(lessBreaks) * minutes,
    },
    appointments: result.placements
      .map((p) => ({
        entryId: p.entryId,
        entryTitle: names.title(p.entryId),
        challengeId: p.challengeId,
        challengeLabel: names.label(p.challengeId),
        roomId: p.roomId,
        ...names.room(p.roomId),
        slot: p.slot,
        ...appointmentTimes(timing, p.slot),
      }))
      .sort((a, b) => a.slot - b.slot || a.roomName.localeCompare(b.roomName)),
    reducedBreaks: result.reducedBreaks.map((r) => ({
      entryId: r.entryId,
      entryTitle: names.title(r.entryId),
      fromRoomName: names.room(r.fromRoomId).roomName,
      toRoomName: names.room(r.toRoomId).roomName,
      breakMinutes: r.gap * minutes,
    })),
  };
}

/**
 * Writes a schedule the server has checked, in one transaction that holds
 * the edition's config lock, refusing if one is already saved or the
 * projects and rooms moved since `fingerprint` was taken.
 */
async function writeSchedule(
  db: DrizzleDB,
  userId: string,
  input: { hackathonId: string; timing: ScheduleTiming },
  schedule: {
    placements: Placement[];
    relaxed: boolean;
    fingerprint: string;
    /** The judge of each presentation, as far as there are judges. */
    assignments: readonly JudgeAssignment[];
  },
) {
  return db.transaction(async (tx) => {
    await ensureJudgingConfig(tx, input.hackathonId);
    // One save at a time per edition, and none while an import or room
    // change that locks the same row is mid-flight.
    await tx
      .select({ id: judgingConfigs.hackathonId })
      .from(judgingConfigs)
      .where(eq(judgingConfigs.hackathonId, input.hackathonId))
      .for("update");
    if (await findSchedule(tx, input.hackathonId)) throw scheduleExists();

    const current = await readInventory(tx, input.hackathonId);
    if (planFingerprint(selectPlan(current), input.timing) !== schedule.fingerprint) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Projects, rooms or tables changed while the schedule was being saved. Preview again and check it before saving.",
      });
    }

    const [row] = await tx
      .insert(judgingSchedules)
      .values({
        hackathonId: input.hackathonId,
        ...input.timing,
        reducedBreaksAcknowledgedAt: schedule.relaxed ? new Date() : null,
        createdById: userId,
      })
      .returning({ id: judgingSchedules.id });

    // A judge removed since the assignment was made has no appointments left.
    const judges = new Set(
      (
        await tx
          .select({ id: judgingJudges.id })
          .from(judgingJudges)
          .where(eq(judgingJudges.hackathonId, input.hackathonId))
      ).map((judge) => judge.id),
    );
    const judgeOf = new Map(
      schedule.assignments
        .filter((a) => judges.has(a.judgeId))
        .map((a) => [taskKey(a.entryId, a.challengeId), a.judgeId]),
    );

    const rows = schedule.placements.map((p) => ({
      scheduleId: row!.id,
      hackathonId: input.hackathonId,
      entryId: p.entryId,
      challengeId: p.challengeId,
      roomId: p.roomId,
      assignedJudgeId: judgeOf.get(taskKey(p.entryId, p.challengeId)) ?? null,
      ...appointmentTimes(input.timing, p.slot),
    }));
    // Postgres takes at most 65535 parameters per statement.
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(judgingAppointments).values(rows.slice(i, i + 1000));
    }

    return {
      scheduleId: row!.id,
      appointments: rows.length,
      judged: rows.filter((r) => r.assignedJudgeId).length,
    };
  });
}

/**
 * The uploaded CP-SAT solution, checked against the edition as it stands,
 * with its judges checked against `judges` as they are now.
 */
function readUpload(
  inventory: Inventory,
  timing: ScheduleTiming,
  solution: string,
  judges: readonly JudgeInput[],
) {
  const { inputs, fingerprint } = planOf(inventory, timing);
  const read = readCpsatSolution(inputs, fingerprint, solution, judges);
  if (!read.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: read.reason });
  }
  return {
    inputs,
    fingerprint,
    read,
    key: candidateKey(fingerprint, read.relaxed, read.placements),
  };
}

/** What a CP-SAT preview says about the judges. */
function describeJudging(
  read: { judging: { source: "cp-sat" | "in-app"; metrics: { unassigned: number } } },
  judges: readonly JudgeInput[],
  presentations: number,
) {
  return {
    judges: judges.length,
    presentations,
    unassigned: read.judging.metrics.unassigned,
    // Who worked the assignment out.
    source: read.judging.source,
  };
}

/** The saved schedule with everything the board and the move pickers need. */
async function loadBoard(
  db: JudgingDb,
  hackathonId: string,
  now: Date,
  lock = false,
) {
  const schedule = await findSchedule(db, hackathonId, lock);
  const [inventory, booked, evaluations, presence] = await Promise.all([
    readInventory(db, hackathonId),
    schedule
      ? db
          .select({
            id: judgingAppointments.id,
            entryId: judgingAppointments.entryId,
            challengeId: judgingAppointments.challengeId,
            roomId: judgingAppointments.roomId,
            startsAt: judgingAppointments.startsAt,
            deadlineAt: judgingAppointments.deadlineAt,
            endsAt: judgingAppointments.endsAt,
            revision: judgingAppointments.revision,
            assignedJudgeId: judgingAppointments.assignedJudgeId,
            entryTitle: judgingEntries.title,
            entryDeletedAt: judgingEntries.deletedAt,
          })
          .from(judgingAppointments)
          .innerJoin(
            judgingEntries,
            eq(judgingEntries.id, judgingAppointments.entryId),
          )
          .where(eq(judgingAppointments.scheduleId, schedule.id))
          .orderBy(asc(judgingAppointments.startsAt))
      : Promise.resolve([]),
    schedule
      ? db
          .select({
            judgeId: judgingEvaluations.judgeId,
            entryId: judgingEvaluations.entryId,
            challengeId: judgingEvaluations.challengeId,
            appointmentId: judgingEvaluations.appointmentId,
            ratingsComplete: holdsEveryRating(hackathonId),
          })
          .from(judgingEvaluations)
          .where(eq(judgingEvaluations.hackathonId, hackathonId))
      : Promise.resolve([]),
    db
      .select({
        judgeId: judgingPresence.judgeId,
        roomId: judgingPresence.roomId,
        joinedAt: judgingPresence.joinedAt,
        lastSeenAt: judgingPresence.lastSeenAt,
        leftAt: judgingPresence.leftAt,
      })
      .from(judgingPresence)
      .where(eq(judgingPresence.hackathonId, hackathonId)),
  ]);

  const roots = new Map(
    inventory.challenges.map((c) => [
      c.id,
      rootOf(inventory.challenges, c.id)?.id ?? null,
    ]),
  );
  const rootIdOf = (id: string) => roots.get(id) ?? null;
  return {
    schedule,
    inventory,
    plan: selectPlan(inventory),
    names: namesOf(inventory),
    evaluations,
    presence,
    rootIdOf,
    appointments: withStatus(booked, evaluations, rootIdOf, now),
    staffed: staffedRoomIds(presence, now),
  };
}

type Board = Awaited<ReturnType<typeof loadBoard>>;
type SavedSchedule = NonNullable<Board["schedule"]>;

/**
 * The board's judges: who can be given presentations, and the saved
 * appointments the way the assigner takes them. An appointment is open to a
 * new judge while it has not started and nobody has begun an evaluation.
 */
async function loadJudging(
  db: JudgingDb,
  board: Board,
  schedule: SavedSchedule,
  now: Date,
) {
  const hackathonId = schedule.hackathonId;
  const [roster, drafts] = await Promise.all([
    readRoster(db, hackathonId, board.inventory, now),
    db
      .select({
        judgeId: judgingEvaluationDrafts.judgeId,
        entryId: judgingEvaluationDrafts.entryId,
        challengeId: judgingEvaluationDrafts.challengeId,
        appointmentId: judgingEvaluationDrafts.appointmentId,
        updatedAt: judgingEvaluationDrafts.updatedAt,
        deadlineAt: judgingEvaluationDrafts.deadlineAt,
      })
      .from(judgingEvaluationDrafts)
      .where(eq(judgingEvaluationDrafts.hackathonId, hackathonId)),
  ]);

  const timing = timingOf(schedule);
  const planned = new Set(
    board.plan.tasks.map((t) => taskKey(t.entryId, t.challengeId)),
  );
  const rootOfChallenge = (id: string) =>
    rootOf(board.inventory.challenges, id)?.id ?? null;
  const started = (a: Board["appointments"][number]) =>
    drafts.some(
      (d) =>
        d.entryId === a.entryId &&
        (d.appointmentId
          ? d.appointmentId === a.id
          : rootOfChallenge(d.challengeId) === a.challengeId),
    );

  const saved: SavedAppointment[] = board.appointments.flatMap((a) => {
    // Saved appointments sit on the grid; one that does not has no slot to compare.
    const slot = slotAt(timing, a.startsAt);
    if (slot === null) return [];
    return [
      {
        id: a.id,
        entryId: a.entryId,
        challengeId: a.challengeId,
        roomId: a.roomId,
        slot,
        assignedJudgeId: a.assignedJudgeId,
        removed:
          !!a.entryDeletedAt || !planned.has(taskKey(a.entryId, a.challengeId)),
        open: a.status === "future" && !started(a),
      },
    ];
  });

  return {
    roster,
    saved,
    drafts,
    plan: planOfSaved(board, timing, saved, roster),
    timing,
  };
}

/** The saved appointments as the judge assigner takes them. */
function planOfSaved(
  board: Board,
  timing: ScheduleTiming,
  saved: readonly SavedAppointment[],
  roster: Roster,
) {
  return judgePlanOf({
    rooms: board.inventory.rooms,
    sponsorChallengeIds: new Set(
      board.inventory.challenges.filter((c) => !c.isGeneral).map((c) => c.id),
    ),
    grid: gridOf(timing),
    appointments: saved,
    judgeIds: new Set(roster.judges.map((j) => j.id)),
  });
}

type Judging = Awaited<ReturnType<typeof loadJudging>>;

/** What the board shows about judges: loads, and where there are too few. */
function describeBoardJudging(judging: Judging, board: Board, now: Date) {
  const { roster, saved, plan, timing } = judging;
  const live = saved.filter((a) => !a.removed);
  const rooms = new Map(board.inventory.rooms.map((r) => [r.id, r.name]));

  const loads = new Map<string, number>();
  for (const a of live) {
    if (a.assignedJudgeId) {
      loads.set(a.assignedJudgeId, (loads.get(a.assignedJudgeId) ?? 0) + 1);
    }
  }
  const available = new Map(roster.judges.map((j) => [j.id, j]));
  const listed = new Set([...available.keys(), ...loads.keys()]);

  const from = firstSlotFrom(timing, now);
  return {
    judges: roster.judges.length,
    assigned: live.filter((a) => a.assignedJudgeId).length,
    // Still waiting for a judge: ones that have started or are over cannot
    // be given one.
    unassigned: live.filter((a) => a.open && !a.assignedJudgeId).length,
    loads: [...listed]
      .map((id) => {
        const judge = available.get(id);
        return {
          judgeId: id,
          name: roster.names.get(id) ?? "Removed judge",
          kind: judge?.kind ?? null,
          roomName: judge?.roomId ? (rooms.get(judge.roomId) ?? null) : null,
          // Cannot take presentations: a guest with no room or table.
          available: !!judge,
          load: loads.get(id) ?? 0,
        };
      })
      .sort(
        (a, b) =>
          (a.kind === "guest" ? 1 : 0) - (b.kind === "guest" ? 1 : 0) ||
          a.name.localeCompare(b.name),
      ),
    warnings: judgeShortfalls(
      plan.inputs,
      plan.placements,
      roster.judges,
      plan.current,
    )
      .filter((w) => w.slot >= from)
      .map((w) => {
        const challengeLabel = board.names.label(w.challengeId);
        return {
          slot: w.slot,
          startsAt: slotStartsAt(timing, w.slot),
          challengeId: w.challengeId,
          challengeLabel,
          presentations: w.presentations,
          judgesFree: w.judgesFree,
          message: describeShortfall(w, challengeLabel),
        };
      }),
  };
}

/** Whether the appointments or judges differ from when they were last read. */
const staleJudging = (a: Judging, b: Judging) =>
  JSON.stringify([a.saved, a.roster.judges]) !==
  JSON.stringify([b.saved, b.roster.judges]);

/** Who is absent, and who may be given freed work, as of this read of the board. */
function hereOf(judging: Judging, board: Board, now: Date) {
  const open = new Map(judging.saved.map((s) => [s.id, s.open]));
  const absent = absentJudgeIds({
    judges: judging.roster.judges,
    presence: board.presence,
    appointments: board.appointments.map((a) => ({
      assignedJudgeId: a.assignedJudgeId,
      startsAt: a.startsAt,
      open: open.get(a.id) ?? false,
      status: a.status,
    })),
    now,
  });
  const receivers = receiverIds({
    judges: judging.roster.judges,
    presence: board.presence,
    absent,
    now,
  });
  // Under way once the earliest open appointment is within LATE_WITHIN_MS of
  // starting, the point at which a member never seen counts as absent.
  const starts = board.appointments
    .filter((a) => open.get(a.id))
    .map((a) => a.startsAt.getTime());
  const underWay =
    starts.length > 0 && now.getTime() >= Math.min(...starts) - LATE_WITHIN_MS;
  return { absent, receivers, underWay };
}

/**
 * The roster without the absent judges. Of the rest, only receivers keep their
 * challenges; the others stay able to grade nothing, so they keep what they
 * hold and gain no more.
 */
const givableRosterOf = (
  judging: Judging,
  absent: ReadonlySet<string>,
  receivers: ReadonlySet<string>,
) => ({
  ...judging.roster,
  judges: judging.roster.judges
    .filter((j) => !absent.has(j.id))
    .map((j) => (receivers.has(j.id) ? j : { ...j, challengeIds: [] })),
});

/** Whether presence moved anyone in or out of the absent or receiving sets. */
const stalePresence = (
  a: ReturnType<typeof hereOf>,
  b: ReturnType<typeof hereOf>,
) =>
  JSON.stringify([[...a.absent].sort(), [...a.receivers].sort()]) !==
  JSON.stringify([[...b.absent].sort(), [...b.receivers].sort()]);

/**
 * The judging with the judges who are absent set aside, for handing out work
 * on a day when it matters. Before judging is under way nobody has checked in,
 * so every judge may be given work; once it is, only receivers may.
 */
function withoutAbsent(
  judging: Judging,
  board: Board,
  here: ReturnType<typeof hereOf>,
) {
  const receivers = here.underWay
    ? here.receivers
    : new Set(judging.roster.judges.map((j) => j.id));
  if (
    here.absent.size === 0 &&
    judging.roster.judges.every((j) => receivers.has(j.id))
  ) {
    return judging;
  }
  const roster = givableRosterOf(judging, here.absent, receivers);
  return {
    ...judging,
    roster,
    plan: planOfSaved(board, judging.timing, judging.saved, roster),
  };
}

/** Writes the new judges: one update per judge, however many appointments they gain. */
async function applyJudgeChanges(
  tx: JudgingDb,
  changes: readonly { id: string; assignedJudgeId: string | null }[],
) {
  const byJudge = new Map<string | null, string[]>();
  for (const change of changes) {
    const list = byJudge.get(change.assignedJudgeId);
    if (list) list.push(change.id);
    else byJudge.set(change.assignedJudgeId, [change.id]);
  }
  for (const [judgeId, ids] of byJudge) {
    for (let i = 0; i < ids.length; i += 1000) {
      await tx
        .update(judgingAppointments)
        .set({ assignedJudgeId: judgeId })
        .where(inArray(judgingAppointments.id, ids.slice(i, i + 1000)));
    }
  }
}

/**
 * Who should grade what once the judges who left or went quiet are set
 * aside: only what they held, and what has no judge, is given again, to the
 * judges who are here. Null when there is nothing to give.
 */
function rebalanceOf(
  judging: Judging,
  board: Board,
  now: Date,
  here: ReturnType<typeof hereOf>,
) {
  const roster = givableRosterOf(judging, here.absent, here.receivers);
  const { free, keep } = rebalancePlan(
    judging.saved,
    new Set(roster.judges.map((j) => j.id)),
  );
  if (free.length === 0) return null;

  const plan = planOfSaved(board, judging.timing, judging.saved, roster);
  const made = assignJudges(plan.inputs, plan.placements, roster.judges, {
    keep: [...plan.keep, ...keep],
  });
  return { assignments: made.assignment, kept: plan.keep.length + keep.length };
}

/**
 * Re-balances the edition's judges on their own, when the organiser has not
 * turned that off. Never CP-SAT: this runs on reads and has to be quick.
 * Gives up quietly when appointments or judges change underneath it; the
 * next read tries again.
 */
async function rebalance(db: DrizzleDB, hackathonId: string, now: Date) {
  const [config] = await db
    .select({ autoRebalance: judgingConfigs.autoRebalance })
    .from(judgingConfigs)
    .where(eq(judgingConfigs.hackathonId, hackathonId))
    .limit(1);
  if (!config?.autoRebalance) return;

  const first = await loadBoard(db, hackathonId, now);
  if (!first.schedule) return;
  const before = await loadJudging(db, first, first.schedule, now);
  const hereBefore = hereOf(before, first, now);
  const made = rebalanceOf(before, first, now, hereBefore);
  if (!made) return;

  const changed = await db.transaction(async (tx) => {
    const board = await loadBoard(tx, hackathonId, now, true);
    if (!board.schedule) return 0;
    const judging = await loadJudging(tx, board, board.schedule, now);
    if (staleJudging(judging, before)) return 0;
    if (stalePresence(hereOf(judging, board, now), hereBefore)) return 0;

    const changes = judgeChanges(judging.saved, made.assignments);
    if (changes.length === 0) return 0;
    await applyJudgeChanges(tx, changes);
    await tx
      .update(judgingSchedules)
      .set({ lastRebalancedAt: now, lastRebalanceChanged: changes.length })
      .where(eq(judgingSchedules.id, board.schedule.id));
    return changes.length;
  });
  if (changed === 0) return;

  await recordAdminAction(db, {
    userId: null,
    action: "judging.schedule.rebalance",
    resourceId: hackathonId,
    metadata: { changed, kept: made.kept },
  });
}

/** When each edition was last re-balanced, to keep reads from doing it every time. */
export const rebalanceThrottle = new Map<string, number>();
const REBALANCE_EVERY_MS = 30_000;

/**
 * Re-balances the edition's judges unless that was done less than 30 seconds
 * ago in this process. There is no worker, so the board and the judges'
 * itineraries call it. Never throws: a read must
 * not fail because of it.
 */
export async function rebalanceIfDue(
  db: DrizzleDB,
  hackathonId: string,
  now: Date = new Date(),
) {
  const last = rebalanceThrottle.get(hackathonId);
  if (last !== undefined && now.getTime() - last < REBALANCE_EVERY_MS) return;
  rebalanceThrottle.set(hackathonId, now.getTime());
  try {
    await rebalance(db, hackathonId, now);
  } catch (error) {
    // Deliberate operational logging: the read goes on and the next one
    // tries again, so this is the only record that it failed.
    // oxlint-disable-next-line no-console
    console.error(`[Judging] Re-balance for ${hackathonId} failed:`, error);
  }
}

/**
 * Who should grade the open presentations: CP-SAT when this server runs it
 * and its answer passes the checks, the in-app assigner otherwise.
 */
async function makeAssignments(
  judging: Judging,
  options: { seconds: number; signal?: AbortSignal },
) {
  const { plan, roster } = judging;
  if (cpsatAvailable()) {
    const run = await runCpsat(
      cpsatAssignmentProblem(plan.inputs, plan.placements, roster.judges, plan.keep),
      options,
    );
    if (run.status === "solved") {
      const read = readCpsatAssignments(
        plan.inputs,
        plan.placements,
        roster.judges,
        plan.keep,
        run.solution,
      );
      if (read.ok) {
        return { assignments: read.assignments, solver: "cp-sat" as const };
      }
    }
  }
  const made = assignJudges(plan.inputs, plan.placements, roster.judges, {
    keep: plan.keep,
  });
  return { assignments: made.assignment, solver: "in-app" as const };
}

/**
 * Every free future slot `task` can take, best first. Only rooms with a
 * judge seen in the last 15 minutes are offered: a slot in an empty room is
 * a presentation nobody sees.
 */
function rankChoices(
  board: Board,
  schedule: SavedSchedule,
  task: { entryId: string; challengeId: string },
  current: { id: string; roomId: string; startsAt: Date } | null,
  now: Date,
) {
  const timing = timingOf(schedule);
  // Saved appointments sit on the grid: save and every move put them there.
  const slotOf = (startsAt: Date) => slotAt(timing, startsAt)!;
  const choices = moveChoices({
    ...gridOf(timing),
    rooms: board.inventory.rooms,
    sponsorChallengeIds: new Set(
      board.inventory.challenges.filter((c) => !c.isGeneral).map((c) => c.id),
    ),
    booked: board.appointments
      .filter((a) => a.id !== current?.id)
      .map((a) => ({
        entryId: a.entryId,
        challengeId: a.challengeId,
        roomId: a.roomId,
        slot: slotOf(a.startsAt),
      })),
    task,
    current: current
      ? { roomId: current.roomId, slot: slotOf(current.startsAt) }
      : null,
    openRoomIds: board.plan.rooms
      .filter((r) => r.challengeId === task.challengeId && board.staffed.has(r.id))
      .map((r) => r.id),
    fromSlot: firstSlotFrom(timing, now),
  });

  return choices.map((choice) => ({
    roomId: choice.roomId,
    ...board.names.room(choice.roomId),
    ...appointmentTimes(timing, choice.slot),
    reducedBreaks: choice.reducedBreaks,
  }));
}

type Choice = ReturnType<typeof rankChoices>[number];

function pickChoice(
  choices: Choice[],
  wanted: { roomId: string; startsAt: Date; acknowledgeReducedBreaks: boolean },
  timing: ScheduleTiming,
): Choice {
  const choice = choices.find(
    (c) =>
      c.roomId === wanted.roomId &&
      c.startsAt.getTime() === wanted.startsAt.getTime(),
  );
  if (!choice) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "That time at that room or table is no longer open for this project. Reload the choices and pick another.",
    });
  }
  if (choice.reducedBreaks > 0 && !wanted.acknowledgeReducedBreaks) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `That time leaves the team less than ${timing.crossBuildingBreakMinutes} minutes to change buildings. Confirm the shorter break to book it.`,
    });
  }
  return choice;
}

function assertMovable(status: Board["appointments"][number]["status"]) {
  if (status === "pending") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This presentation is happening now, so it stays where it is. Move it once its slot has passed if nobody judged it.",
    });
  }
  if (status === "complete" || status === "incomplete") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Judges have already evaluated this presentation, so it stays where it is.",
    });
  }
}

const noSchedule = () =>
  new TRPCError({
    code: "NOT_FOUND",
    message: "No schedule is saved for this hackathon. Preview one and save it first.",
  });

const noJudgeNeeded = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "That project is no longer entered, so it needs no judge.",
  });

const scheduleExists = () =>
  new TRPCError({
    code: "CONFLICT",
    message:
      "A schedule is already saved. Move appointments one at a time, or drop it before building a new one.",
  });

export const judgingScheduleRouter = createTRPCRouter({
  /**
   * Solves the edition for a timing without saving anything. The answer is
   * deterministic, and `candidateKey` names it so save can tell whether it
   * would write the same schedule.
   */
  preview: isAdmin
    .input(z.object({ hackathonId: uuid, timing: timingInput }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      assertWindowAhead(input.timing);
      if (await findSchedule(db, input.hackathonId)) throw scheduleExists();

      const inventory = await readInventory(db, input.hackathonId);
      const names = namesOf(inventory);
      const roster = await readRoster(db, input.hackathonId, inventory, new Date());
      const solved = solveInventory(inventory, input.timing, roster.judges);
      const { inputs, result, key, proven, roomsLeftOut } = solved;
      const advice = adviceOf(inventory, roster, solved, input.timing);

      if (!result.ok) {
        return {
          slots: inputs.slots,
          slotMinutes: slotMinutes(input.timing),
          presentations: inputs.tasks.length,
          projects: new Set(inputs.tasks.map((t) => t.entryId)).size,
          rooms: inputs.rooms.length,
          tables: names.tables(inputs.rooms),
          ok: false as const,
          relaxed: false,
          candidateKey: null,
          diagnostics: explain(result.diagnostics, names),
          advice,
          summary: null,
          proven: null,
          appointments: [],
          reducedBreaks: [],
        };
      }

      return {
        ...describePlan(result, inputs, names, input.timing, roomsLeftOut),
        candidateKey: key!,
        proven,
        advice,
      };
    }),

  /**
   * A window to start the planner with: from the next quarter hour at least
   * 15 minutes away, as long as the fewest slots the entries need plus a fifth,
   * then longer until a schedule fits. Null when there is nothing to schedule
   * or a schedule is saved already.
   */
  suggestTiming: isAdmin
    .input(z.object({ hackathonId: uuid }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      if (await findSchedule(db, input.hackathonId)) return null;

      const inventory = await readInventory(db, input.hackathonId);
      if (selectPlan(inventory).tasks.length === 0) return null;
      const roster = await readRoster(db, input.hackathonId, inventory, new Date());

      const windowStart = new Date(
        Math.ceil((Date.now() + QUARTER_HOUR) / QUARTER_HOUR) * QUARTER_HOUR,
      );
      const windowOf = (slots: number): ScheduleTiming => {
        const base = { ...DEFAULT_MINUTES, windowStart, windowEnd: windowStart };
        return {
          ...base,
          windowEnd: new Date(
            windowStart.getTime() + slots * slotMinutes(base) * 60_000,
          ),
        };
      };

      const plan = selectPlan(inventory);
      const lowest = slotsNeeded({ ...plan, ...gridOf(windowOf(1)) });
      let slots = Math.min(MAX_SLOTS, Math.ceil(lowest * 1.2));
      let solved = solveInventory(inventory, windowOf(slots), roster.judges);
      for (
        let tries = 1;
        tries < 5 && !solved.result.ok && slots < MAX_SLOTS;
        tries += 1
      ) {
        slots = Math.min(MAX_SLOTS, Math.ceil(slots * 1.25));
        solved = solveInventory(inventory, windowOf(slots), roster.judges);
      }

      const timing = windowOf(slots);
      return {
        timing,
        basis: {
          projects: new Set(solved.inputs.tasks.map((t) => t.entryId)).size,
          presentations: solved.inputs.tasks.length,
          rooms: solved.inputs.rooms.length,
          memberJudges: roster.judges.filter((j) => j.kind === "member").length,
        },
        spareMinutes: solved.result.ok
          ? (slots - solved.result.score[2]) * slotMinutes(timing)
          : 0,
      };
    }),

  /**
   * Saves the schedule the organiser previewed. Solves again here rather
   * than trusting the client, refuses if that gives a different schedule or
   * the inventory changed before the write, and needs a yes to shortened
   * breaks.
   */
  save: isAdmin
    .input(
      z.object({
        hackathonId: uuid,
        timing: timingInput,
        candidateKey: z.string().regex(/^[0-9a-f]{64}$/),
        acknowledgeReducedBreaks: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      assertWindowAhead(input.timing);

      // Solved before the transaction so no lock is held while it computes.
      // Judges first come with the schedule, as far as there are any yet;
      // assignJudges picks up the rest once more have joined.
      const inventory = await readInventory(db, input.hackathonId);
      const roster = await readRoster(db, input.hackathonId, inventory, new Date());
      const { inputs, result, key, fingerprint } = solveInventory(
        inventory,
        input.timing,
        roster.judges,
      );
      if (!result.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: explain(result.diagnostics, namesOf(inventory)).join(" "),
        });
      }
      if (key !== input.candidateKey) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Projects, rooms, tables, judges or timing changed since this preview, so it is not the schedule that would be saved. Preview again and check it before saving.",
        });
      }
      if (result.relaxed && !input.acknowledgeReducedBreaks) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `This schedule gives ${plural(result.reducedBreaks.length, "change", "changes")} of building only the ${input.timing.sameBuildingBreakMinutes}-minute break. Confirm the shorter breaks to save it.`,
        });
      }

      const written = await writeSchedule(db, ctx.userId, input, {
        placements: result.placements,
        relaxed: result.relaxed,
        fingerprint,
        assignments: assignJudges(inputs, result.placements, roster.judges)
          .assignment,
      });
      const saved = {
        ...written,
        relaxed: result.relaxed,
        reducedBreaks: result.reducedBreaks.length,
      };

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.save",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: saved,
      });

      return saved;
    }),

  /** Deletes the saved schedule and its appointments, until the first result is in. */
  drop: isAdmin
    .input(z.object({ hackathonId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const dropped = await db.transaction(async (tx) => {
        const schedule = await findSchedule(tx, input.hackathonId, true);
        if (!schedule) throw noSchedule();
        if (schedule.firstResultAt) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Judges have submitted results against this schedule, so it can no longer be dropped. Move appointments one at a time instead.",
          });
        }
        const removed = await tx
          .delete(judgingAppointments)
          .where(eq(judgingAppointments.scheduleId, schedule.id))
          .returning({ id: judgingAppointments.id });
        await tx
          .delete(judgingSchedules)
          .where(eq(judgingSchedules.id, schedule.id));
        return { scheduleId: schedule.id, appointments: removed.length };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.drop",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: dropped,
      });

      return dropped;
    }),

  /**
   * The problem for the CP-SAT fallback (scripts/judging-schedule/cpsat.py),
   * to run on a laptop when the in-app solver finds no schedule, or to look
   * for a better one. When the in-app solver did find one, it goes along as
   * the hint, so CP-SAT starts from it rather than from nothing.
   */
  cpsatProblem: isAdmin
    .input(z.object({ hackathonId: uuid, timing: timingInput }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      if (await findSchedule(db, input.hackathonId)) throw scheduleExists();

      const inventory = await readInventory(db, input.hackathonId);
      const { inputs, result, fingerprint } = solveInventory(inventory, input.timing);
      const roster = await readRoster(db, input.hackathonId, inventory, new Date());
      const problem = cpsatProblem(
        inputs,
        fingerprint,
        result.ok ? result.placements : undefined,
        roster.judges,
      );
      return {
        fileName: "problem.json",
        contents: JSON.stringify(problem, null, 2),
        command: CPSAT_COMMAND,
        presentations: inputs.tasks.length,
        hinted: result.ok,
        judges: roster.judges.length,
      };
    }),

  /** Checks an uploaded CP-SAT solution and shows it the way preview does. */
  previewCpsat: isAdminUpload
    .input(
      z.object({
        hackathonId: uuid,
        timing: timingInput,
        solution: z.string().min(1).max(10 * 1024 * 1024),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      assertWindowAhead(input.timing);
      if (await findSchedule(db, input.hackathonId)) throw scheduleExists();

      const inventory = await readInventory(db, input.hackathonId);
      const roster = await readRoster(db, input.hackathonId, inventory, new Date());
      const { inputs, read, key } = readUpload(
        inventory,
        input.timing,
        input.solution,
        roster.judges,
      );
      return {
        ...describePlan(read, inputs, namesOf(inventory), input.timing),
        candidateKey: key,
        // CP-SAT's own word: "optimal" means it proved nothing beats this.
        solverStatus: read.status,
        judging: describeJudging(read, roster.judges, inputs.tasks.length),
      };
    }),

  /** Saves a checked CP-SAT solution, the one previewCpsat showed. */
  saveCpsat: isAdminUpload
    .input(
      z.object({
        hackathonId: uuid,
        timing: timingInput,
        solution: z.string().min(1).max(10 * 1024 * 1024),
        candidateKey: z.string().regex(/^[0-9a-f]{64}$/),
        acknowledgeReducedBreaks: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      assertWindowAhead(input.timing);

      const inventory = await readInventory(db, input.hackathonId);
      const roster = await readRoster(db, input.hackathonId, inventory, new Date());
      const { read, key, fingerprint } = readUpload(
        inventory,
        input.timing,
        input.solution,
        roster.judges,
      );
      if (key !== input.candidateKey) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This is not the schedule that was previewed. Upload the solution again and check it before saving.",
        });
      }
      if (read.relaxed && !input.acknowledgeReducedBreaks) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `This schedule gives ${plural(read.reducedBreaks.length, "change", "changes")} of building only the ${input.timing.sameBuildingBreakMinutes}-minute break. Confirm the shorter breaks to save it.`,
        });
      }

      const written = await writeSchedule(db, ctx.userId, input, {
        placements: read.placements,
        relaxed: read.relaxed,
        fingerprint,
        assignments: read.judging.assignments,
      });
      const saved = {
        ...written,
        relaxed: read.relaxed,
        reducedBreaks: read.reducedBreaks.length,
        solver: "cp-sat",
        judges: read.judging.source,
      };

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.save",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: saved,
      });

      return saved;
    }),

  /**
   * Whether this server can run CP-SAT itself (JUDGING_CPSAT_PYTHON set and
   * cpsat.py present). Without it, CP-SAT is download, run, upload.
   */
  cpsatAvailability: isAdmin
    .input(z.object({ hackathonId: uuid }))
    .query(() => ({ available: cpsatAvailable() })),

  /**
   * Runs CP-SAT here on the problem cpsatProblem would download, starting
   * from aamoghCPSolver's schedule, and shows the result the way previewCpsat
   * does. `solution` is what the script printed: saveCpsat takes it back and
   * checks it again, exactly as it does an upload. The script is stopped if
   * the request is abandoned (a closed tab) before it ends.
   */
  solveCpsat: isAdmin
    .input(
      z.object({
        hackathonId: uuid,
        timing: timingInput,
        seconds: z
          .number()
          .int()
          .min(CPSAT_SECONDS.min)
          .max(CPSAT_SECONDS.max)
          .default(CPSAT_SECONDS.default),
      }),
    )
    .mutation(async ({ ctx, input, signal }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      assertWindowAhead(input.timing);
      if (await findSchedule(db, input.hackathonId)) throw scheduleExists();
      if (!cpsatAvailable()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: CPSAT_UNAVAILABLE });
      }

      const inventory = await readInventory(db, input.hackathonId);
      const { inputs, result, fingerprint } = solveInventory(inventory, input.timing);
      const roster = await readRoster(db, input.hackathonId, inventory, new Date());
      const run = await runCpsat(
        cpsatProblem(
          inputs,
          fingerprint,
          result.ok ? result.placements : undefined,
          roster.judges,
        ),
        { seconds: input.seconds, signal },
      );
      if (run.status === "failed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: run.reason });
      }
      if (run.status === "timedOut") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "CP-SAT ran out of time before finding a schedule. Give it more seconds, or download the problem and run the script with a larger --time-limit.",
        });
      }
      // A proof of infeasibility is refused here with its reasons; a schedule
      // has to pass the same checks as an upload.
      const { read, key } = readUpload(
        inventory,
        input.timing,
        run.solution,
        roster.judges,
      );
      return {
        ...describePlan(read, inputs, namesOf(inventory), input.timing),
        candidateKey: key,
        solverStatus: read.status,
        judging: describeJudging(read, roster.judges, inputs.tasks.length),
        solution: run.solution,
      };
    }),

  /**
   * The board: every appointment with its status, the rooms and whether a
   * judge is in each, and the presentations that have no appointment (a late
   * import, say).
   */
  get: isAdmin
    .input(z.object({ hackathonId: uuid }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      const now = new Date();
      // Drafts past their deadline count as submitted; there is no worker
      // that submits them, so the board does before reading statuses.
      await reconcileDueDrafts(db, input.hackathonId, now);
      // Same for judges who left: nothing else moves their presentations.
      await rebalanceIfDue(db, input.hackathonId, now);
      const board = await loadBoard(db, input.hackathonId, now);
      const { schedule, names } = board;
      const [config] = await db
        .select({ autoRebalance: judgingConfigs.autoRebalance })
        .from(judgingConfigs)
        .where(eq(judgingConfigs.hackathonId, input.hackathonId))
        .limit(1);
      const judging = schedule
        ? await loadJudging(db, board, schedule, now)
        : null;

      const planned = new Set(board.plan.tasks.map((t) => taskKey(t.entryId, t.challengeId)));
      const booked = new Set(
        board.appointments.map((a) => taskKey(a.entryId, a.challengeId)),
      );
      const scheduledRooms = new Set(board.plan.rooms.map((r) => r.id));
      // Its judge can be chosen anew: it has not started and nobody has
      // begun on it.
      const assignable = new Set(
        judging?.saved.filter((s) => s.open && !s.removed).map((s) => s.id),
      );
      // Deleted, or no longer in this challenge, since the schedule was saved.
      const isRemoved = (a: Board["appointments"][number]) =>
        !!a.entryDeletedAt || !planned.has(taskKey(a.entryId, a.challengeId));
      // Where each assigned judge has got on a presentation that has started.
      const progress = judging
        ? judgeProgressById(
            board.appointments.filter((a) => !isRemoved(a)),
            board.evaluations,
            judging.drafts,
            board.rootIdOf,
            now,
            schedule ?? undefined,
          )
        : new Map<string, JudgeProgress>();

      return {
        serverNow: now,
        schedule: schedule
          ? {
              id: schedule.id,
              ...timingOf(schedule),
              slotMinutes: slotMinutes(timingOf(schedule)),
              reducedBreaksAcknowledgedAt: schedule.reducedBreaksAcknowledgedAt,
              firstResultAt: schedule.firstResultAt,
              createdAt: schedule.createdAt,
              canDrop: !schedule.firstResultAt,
            }
          : null,
        rooms: board.inventory.rooms
          .filter((r) => !r.archivedAt)
          .map((r) => ({
            id: r.id,
            name: r.name,
            kind: r.kind,
            buildingId: r.buildingId,
            buildingName: r.buildingName,
            challengeId: r.challengeId,
            challengeLabel: names.label(r.challengeId),
            // Takes appointments: in a building, serving a scheduled challenge.
            scheduled: scheduledRooms.has(r.id),
            staffed: board.staffed.has(r.id),
          })),
        appointments: board.appointments.map((a) => ({
          id: a.id,
          entryId: a.entryId,
          entryTitle: a.entryTitle,
          removed: isRemoved(a),
          challengeId: a.challengeId,
          challengeLabel: names.label(a.challengeId),
          roomId: a.roomId,
          ...names.room(a.roomId),
          startsAt: a.startsAt,
          deadlineAt: a.deadlineAt,
          endsAt: a.endsAt,
          revision: a.revision,
          status: a.status,
          canMove: a.canMove,
          evaluationCount: a.evaluationCount,
          assignedJudgeId: a.assignedJudgeId,
          assignedJudgeName: a.assignedJudgeId
            ? (judging?.roster.names.get(a.assignedJudgeId) ?? "Removed judge")
            : null,
          canAssignJudge: assignable.has(a.id),
          judgeProgress: progress.get(a.id) ?? null,
        })),
        judging:
          judging && schedule
            ? {
                ...describeBoardJudging(judging, board, now),
                autoRebalance: config?.autoRebalance ?? false,
                lastRebalancedAt: schedule.lastRebalancedAt,
                lastRebalanceChanged: schedule.lastRebalanceChanged,
              }
            : null,
        unscheduled: schedule
          ? board.plan.tasks
              .filter((t) => !booked.has(taskKey(t.entryId, t.challengeId)))
              .map((t) => ({
                entryId: t.entryId,
                entryTitle: names.title(t.entryId),
                challengeId: t.challengeId,
                challengeLabel: names.label(t.challengeId),
              }))
          : [],
      };
    }),

  /**
   * Where an appointment could go instead: every future free slot in a
   * staffed room of its challenge that keeps the team's breaks, those that
   * shorten a walk between buildings last. The first is the suggestion.
   */
  moveChoices: isAdmin
    .input(z.object({ hackathonId: uuid, appointmentId: uuid }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const now = new Date();
      const board = await loadBoard(db, input.hackathonId, now);
      const appointment = board.appointments.find(
        (a) => a.id === input.appointmentId,
      );
      if (!board.schedule || !appointment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That appointment no longer exists. Reload the board.",
        });
      }
      assertMovable(appointment.status);

      const choices = rankChoices(
        board,
        board.schedule,
        appointment,
        appointment,
        now,
      );
      return {
        appointment: {
          id: appointment.id,
          entryId: appointment.entryId,
          entryTitle: appointment.entryTitle,
          challengeId: appointment.challengeId,
          challengeLabel: board.names.label(appointment.challengeId),
          roomId: appointment.roomId,
          ...board.names.room(appointment.roomId),
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          revision: appointment.revision,
          status: appointment.status,
        },
        choices,
        smartChoice: choices[0] ?? null,
      };
    }),

  /**
   * Moves an appointment to one of its choices. `revision` is the one the
   * organiser saw: if someone else moved it since, nothing changes.
   */
  move: isAdmin
    .input(
      z.object({
        hackathonId: uuid,
        appointmentId: uuid,
        revision: z.number().int().min(0),
        roomId: uuid,
        startsAt: z.date(),
        acknowledgeReducedBreaks: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const stale = () =>
        new TRPCError({
          code: "CONFLICT",
          message:
            "Someone else moved this appointment since you opened it. Reload the board to see where it is now, then choose again.",
        });

      const moved = await db.transaction(async (tx) => {
        const now = new Date();
        // The schedule row guards every booking in it: moves and assignments
        // take turns.
        const board = await loadBoard(tx, input.hackathonId, now, true);
        const appointment = board.appointments.find(
          (a) => a.id === input.appointmentId,
        );
        if (!board.schedule || !appointment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That appointment no longer exists. Reload the board.",
          });
        }
        if (appointment.revision !== input.revision) throw stale();
        assertMovable(appointment.status);

        const choice = pickChoice(
          rankChoices(board, board.schedule, appointment, appointment, now),
          input,
          timingOf(board.schedule),
        );

        // Its judge stays only if they may grade in the new room and are free
        // at the new time; otherwise the organiser assigns judges again.
        let clearsJudge = false;
        if (appointment.assignedJudgeId) {
          const judging = await loadJudging(tx, board, board.schedule, now);
          const judge = judging.roster.judges.find(
            (j) => j.id === appointment.assignedJudgeId,
          );
          const slot = slotAt(judging.timing, choice.startsAt);
          clearsJudge =
            !judge ||
            slot === null ||
            !mayGrade(judge, {
              challengeId: appointment.challengeId,
              roomId: choice.roomId,
            }) ||
            judging.saved.some(
              (other) =>
                other.id !== appointment.id &&
                !other.removed &&
                other.assignedJudgeId === judge.id &&
                other.slot === slot,
            );
        }
        const [updated] = await tx
          .update(judgingAppointments)
          .set({
            roomId: choice.roomId,
            startsAt: choice.startsAt,
            deadlineAt: choice.deadlineAt,
            endsAt: choice.endsAt,
            revision: sql`${judgingAppointments.revision} + 1`,
            ...(clearsJudge ? { assignedJudgeId: null } : {}),
          })
          .where(
            and(
              eq(judgingAppointments.id, appointment.id),
              eq(judgingAppointments.revision, input.revision),
            ),
          )
          .returning({ revision: judgingAppointments.revision });
        if (!updated) throw stale();

        return {
          appointmentId: appointment.id,
          revision: updated.revision,
          fromRoomId: appointment.roomId,
          fromStartsAt: appointment.startsAt,
          toRoomId: choice.roomId,
          toStartsAt: choice.startsAt,
          reducedBreaks: choice.reducedBreaks,
          clearedJudgeId: clearsJudge ? appointment.assignedJudgeId : null,
        };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.move",
        resourceId: moved.appointmentId,
        metadata: { hackathonId: input.hackathonId, ...moved },
      });

      return moved;
    }),

  /**
   * Who could grade an appointment instead: the judges who may grade its
   * challenge in its room, least loaded first, with those already grading
   * something else at that time marked.
   */
  judgeChoices: isAdmin
    .input(z.object({ hackathonId: uuid, appointmentId: uuid }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const now = new Date();
      const board = await loadBoard(db, input.hackathonId, now);
      const appointment = board.appointments.find(
        (a) => a.id === input.appointmentId,
      );
      if (!board.schedule || !appointment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That appointment no longer exists. Reload the board.",
        });
      }
      const judging = await loadJudging(db, board, board.schedule, now);
      const saved = judging.saved.find((s) => s.id === appointment.id);
      if (!saved || saved.removed) throw noJudgeNeeded();

      const titles = new Map(board.appointments.map((a) => [a.id, a.entryTitle]));
      const loads = new Map<string, number>();
      for (const s of judging.saved) {
        if (s.assignedJudgeId && !s.removed) {
          loads.set(s.assignedJudgeId, (loads.get(s.assignedJudgeId) ?? 0) + 1);
        }
      }
      const kinds = new Map(judging.roster.judges.map((j) => [j.id, j.kind]));
      return {
        appointment: {
          id: appointment.id,
          entryTitle: appointment.entryTitle,
          challengeLabel: board.names.label(appointment.challengeId),
          ...board.names.room(appointment.roomId),
          startsAt: appointment.startsAt,
          assignedJudgeId: appointment.assignedJudgeId,
          canAssignJudge: saved.open,
        },
        choices: judgeChoices(judging.roster, saved, judging.saved)
          .map((choice) => ({
            judgeId: choice.judgeId,
            name: judging.roster.names.get(choice.judgeId) ?? "Removed judge",
            kind: kinds.get(choice.judgeId)!,
            load: loads.get(choice.judgeId) ?? 0,
            bookedWith: choice.bookedWith ? (titles.get(choice.bookedWith) ?? null) : null,
            booked: choice.bookedWith !== null,
          }))
          .sort(
            (a, b) =>
              Number(a.booked) - Number(b.booked) ||
              a.load - b.load ||
              a.name.localeCompare(b.name),
          ),
      };
    }),

  /**
   * Sets, or with null clears, the judge of one appointment, until it starts.
   * The judge has to be one who may grade it there and is not already
   * grading something else at that time.
   */
  setAssignedJudge: isAdmin
    .input(
      z.object({
        hackathonId: uuid,
        appointmentId: uuid,
        judgeId: uuid.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const changed = await db.transaction(async (tx) => {
        const now = new Date();
        const board = await loadBoard(tx, input.hackathonId, now, true);
        const appointment = board.appointments.find(
          (a) => a.id === input.appointmentId,
        );
        if (!board.schedule || !appointment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That appointment no longer exists. Reload the board.",
          });
        }
        const judging = await loadJudging(tx, board, board.schedule, now);
        const saved = judging.saved.find((s) => s.id === appointment.id);
        if (!saved || saved.removed) throw noJudgeNeeded();
        if (!saved.open) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "This presentation has started, or a judge has begun on it, so its judge stays.",
          });
        }

        if (input.judgeId) {
          const judge = judging.roster.judges.find((j) => j.id === input.judgeId);
          if (!judge) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message:
                "That judge cannot be assigned. A guest judge needs a room or table of their own.",
            });
          }
          const name = judging.roster.names.get(judge.id) ?? "That judge";
          if (!mayGrade(judge, saved)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${name} cannot grade ${board.names.label(saved.challengeId)} at ${board.names.room(saved.roomId).roomName}.`,
            });
          }
          const booked = judgeChoices(judging.roster, saved, judging.saved).find(
            (c) => c.judgeId === judge.id,
          )?.bookedWith;
          if (booked) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `${name} is already grading ${board.appointments.find((a) => a.id === booked)?.entryTitle ?? "another project"} at that time.`,
            });
          }
        }

        await tx
          .update(judgingAppointments)
          .set({ assignedJudgeId: input.judgeId })
          .where(eq(judgingAppointments.id, appointment.id));
        return {
          appointmentId: appointment.id,
          fromJudgeId: appointment.assignedJudgeId,
          toJudgeId: input.judgeId,
        };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.setJudge",
        resourceId: changed.appointmentId,
        metadata: { hackathonId: input.hackathonId, ...changed },
      });

      return changed;
    }),

  /**
   * Gives every appointment that has not started, and that no judge has
   * begun on, a judge again. The others keep theirs. CP-SAT does it when
   * this server runs it, otherwise the in-app assigner. Warns of each slot
   * where there are too few judges.
   */
  assignJudges: isAdmin
    .input(
      z.object({
        hackathonId: uuid,
        seconds: z
          .number()
          .int()
          .min(CPSAT_SECONDS.min)
          .max(CPSAT_SECONDS.max)
          .default(CPSAT_SECONDS.default),
      }),
    )
    .mutation(async ({ ctx, input, signal }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);

      // Worked out before the transaction, so no lock is held while CP-SAT
      // runs, and checked against the board again inside it.
      const firstNow = new Date();
      const first = await loadBoard(db, input.hackathonId, firstNow);
      if (!first.schedule) throw noSchedule();
      const before = await loadJudging(db, first, first.schedule, firstNow);
      if (before.roster.judges.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No judge can be assigned yet. Judges appear here once they have joined a room or table.",
        });
      }
      const hereBefore = hereOf(before, first, firstNow);
      const made = await makeAssignments(
        withoutAbsent(before, first, hereBefore),
        { seconds: input.seconds, signal },
      );

      const result = await db.transaction(async (tx) => {
        const now = new Date();
        const board = await loadBoard(tx, input.hackathonId, now, true);
        if (!board.schedule) throw noSchedule();
        const judging = await loadJudging(tx, board, board.schedule, now);
        if (
          staleJudging(judging, before) ||
          stalePresence(hereOf(judging, board, now), hereBefore)
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Appointments or judges changed while judges were being assigned. Assign judges again.",
          });
        }

        const changes = judgeChanges(judging.saved, made.assignments);
        await applyJudgeChanges(tx, changes);

        const chosen = new Map(changes.map((c) => [c.id, c.assignedJudgeId]));
        const saved = judging.saved.map((s) =>
          chosen.has(s.id) ? { ...s, assignedJudgeId: chosen.get(s.id)! } : s,
        );
        const present = withoutAbsent(
          judging,
          board,
          hereOf(judging, board, now),
        );
        const summary = describeBoardJudging(
          {
            ...present,
            saved,
            plan: planOfSaved(board, judging.timing, saved, present.roster),
          },
          board,
          now,
        );
        return {
          solver: made.solver,
          changed: changes.length,
          kept: judging.plan.keep.length,
          assigned: summary.assigned,
          unassigned: summary.unassigned,
          warnings: summary.warnings,
        };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.assignJudges",
        resourceId: input.hackathonId,
        metadata: {
          solver: result.solver,
          changed: result.changed,
          kept: result.kept,
          assigned: result.assigned,
          unassigned: result.unassigned,
          warnings: result.warnings.length,
        },
      });

      return result;
    }),

  /** Turns on or off moving presentations off judges who left or went quiet. */
  setAutoRebalance: isAdmin
    .input(z.object({ hackathonId: uuid, enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      await ensureJudgingConfig(db, input.hackathonId);
      await db
        .update(judgingConfigs)
        .set({ autoRebalance: input.enabled })
        .where(eq(judgingConfigs.hackathonId, input.hackathonId));

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.setAutoRebalance",
        resourceId: input.hackathonId,
        metadata: { enabled: input.enabled },
      });

      return { enabled: input.enabled };
    }),

  /** Where a presentation with no appointment yet could go, best first. */
  assignChoices: isAdmin
    .input(z.object({ hackathonId: uuid, entryId: uuid, challengeId: uuid }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const now = new Date();
      const board = await loadBoard(db, input.hackathonId, now);
      const schedule = assertAssignable(board, input);
      const choices = rankChoices(board, schedule, input, null, now);
      return {
        task: {
          entryId: input.entryId,
          entryTitle: board.names.title(input.entryId),
          challengeId: input.challengeId,
          challengeLabel: board.names.label(input.challengeId),
        },
        choices,
        smartChoice: choices[0] ?? null,
      };
    }),

  /** Books a presentation that has no appointment into one of its choices. */
  assign: isAdmin
    .input(
      z.object({
        hackathonId: uuid,
        entryId: uuid,
        challengeId: uuid,
        roomId: uuid,
        startsAt: z.date(),
        acknowledgeReducedBreaks: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const assigned = await db.transaction(async (tx) => {
        const now = new Date();
        const board = await loadBoard(tx, input.hackathonId, now, true);
        const schedule = assertAssignable(board, input);
        const choice = pickChoice(
          rankChoices(board, schedule, input, null, now),
          input,
          timingOf(schedule),
        );
        const [appointment] = await tx
          .insert(judgingAppointments)
          .values({
            scheduleId: schedule.id,
            hackathonId: input.hackathonId,
            entryId: input.entryId,
            challengeId: input.challengeId,
            roomId: choice.roomId,
            startsAt: choice.startsAt,
            deadlineAt: choice.deadlineAt,
            endsAt: choice.endsAt,
          })
          .returning({ id: judgingAppointments.id });

        return {
          appointmentId: appointment!.id,
          entryId: input.entryId,
          challengeId: input.challengeId,
          roomId: choice.roomId,
          startsAt: choice.startsAt,
          reducedBreaks: choice.reducedBreaks,
        };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.schedule.assign",
        resourceId: assigned.appointmentId,
        metadata: { hackathonId: input.hackathonId, ...assigned },
      });

      return assigned;
    }),
});

/** The saved schedule, once `task` is known to need an appointment in it. */
function assertAssignable(
  board: Board,
  task: { entryId: string; challengeId: string },
): SavedSchedule {
  if (!board.schedule) throw noSchedule();
  const key = taskKey(task.entryId, task.challengeId);
  if (!board.plan.tasks.some((t) => taskKey(t.entryId, t.challengeId) === key)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "That project is not entered in a scheduled challenge, so it has nothing to book.",
    });
  }
  if (board.appointments.some((a) => taskKey(a.entryId, a.challengeId) === key)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "That presentation already has an appointment. Move it instead.",
    });
  }
  return board.schedule;
}
