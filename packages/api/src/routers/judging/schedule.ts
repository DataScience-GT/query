import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluations,
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
import { aamoghCPSolver } from "../../services/judging/schedule/aamogh-cp-solver";
import {
  CPSAT_COMMAND,
  cpsatProblem,
  readCpsatSolution,
} from "../../services/judging/schedule/cpsat-bridge";
import {
  CPSAT_SECONDS,
  CPSAT_UNAVAILABLE,
  cpsatAvailable,
  runCpsat,
} from "../../services/judging/schedule/cpsat-runner";
import { reconcileDueDrafts } from "../../services/judging/evaluation-store";
import { moveChoices } from "../../services/judging/schedule/moves";
import {
  staffedRoomIds,
  withStatus,
} from "../../services/judging/schedule/board";
import {
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

/** Solves the edition as it stands for one timing, with aamoghCPSolver. */
function solveInventory(inventory: Inventory, timing: ScheduleTiming) {
  const { inputs, fingerprint } = planOf(inventory, timing);
  const result = aamoghCPSolver(inputs);
  return {
    inputs,
    result,
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

/** A solved schedule as the preview shows it. */
function describePlan(
  result: Extract<PlanResult, { ok: true }>,
  inputs: PlanInputs,
  names: ReturnType<typeof namesOf>,
  timing: ScheduleTiming,
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
  schedule: { placements: Placement[]; relaxed: boolean; fingerprint: string },
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

    const rows = schedule.placements.map((p) => ({
      scheduleId: row!.id,
      hackathonId: input.hackathonId,
      entryId: p.entryId,
      challengeId: p.challengeId,
      roomId: p.roomId,
      ...appointmentTimes(input.timing, p.slot),
    }));
    // Postgres takes at most 65535 parameters per statement.
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(judgingAppointments).values(rows.slice(i, i + 1000));
    }

    return { scheduleId: row!.id, appointments: rows.length };
  });
}

/** The uploaded CP-SAT solution, checked against the edition as it stands. */
function readUpload(inventory: Inventory, timing: ScheduleTiming, solution: string) {
  const { inputs, fingerprint } = planOf(inventory, timing);
  const read = readCpsatSolution(inputs, fingerprint, solution);
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
            isComplete: judgingEvaluations.isComplete,
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
  return {
    schedule,
    inventory,
    plan: selectPlan(inventory),
    names: namesOf(inventory),
    appointments: withStatus(
      booked,
      evaluations,
      presence,
      (id) => roots.get(id) ?? null,
      now,
    ),
    staffed: staffedRoomIds(presence, now),
  };
}

type Board = Awaited<ReturnType<typeof loadBoard>>;
type SavedSchedule = NonNullable<Board["schedule"]>;

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
      const { inputs, result, key, proven } = solveInventory(
        inventory,
        input.timing,
      );

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
          summary: null,
          proven: null,
          appointments: [],
          reducedBreaks: [],
        };
      }

      return {
        ...describePlan(result, inputs, names, input.timing),
        candidateKey: key!,
        proven,
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
      const inventory = await readInventory(db, input.hackathonId);
      const { result, key, fingerprint } = solveInventory(
        inventory,
        input.timing,
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
            "Projects, rooms, tables or timing changed since this preview, so it is not the schedule that would be saved. Preview again and check it before saving.",
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
      const problem = cpsatProblem(
        inputs,
        fingerprint,
        result.ok ? result.placements : undefined,
      );
      return {
        fileName: "problem.json",
        contents: JSON.stringify(problem, null, 2),
        command: CPSAT_COMMAND,
        presentations: inputs.tasks.length,
        hinted: result.ok,
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
      const { inputs, read, key } = readUpload(inventory, input.timing, input.solution);
      return {
        ...describePlan(read, inputs, namesOf(inventory), input.timing),
        candidateKey: key,
        // CP-SAT's own word: "optimal" means it proved nothing beats this.
        solverStatus: read.status,
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
      const { read, key, fingerprint } = readUpload(
        inventory,
        input.timing,
        input.solution,
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
      });
      const saved = {
        ...written,
        relaxed: read.relaxed,
        reducedBreaks: read.reducedBreaks.length,
        solver: "cp-sat",
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
      const run = await runCpsat(
        cpsatProblem(inputs, fingerprint, result.ok ? result.placements : undefined),
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
      const { read, key } = readUpload(inventory, input.timing, run.solution);
      return {
        ...describePlan(read, inputs, namesOf(inventory), input.timing),
        candidateKey: key,
        solverStatus: read.status,
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
      const board = await loadBoard(db, input.hackathonId, now);
      const { schedule, names } = board;

      const planned = new Set(board.plan.tasks.map((t) => taskKey(t.entryId, t.challengeId)));
      const booked = new Set(
        board.appointments.map((a) => taskKey(a.entryId, a.challengeId)),
      );
      const scheduledRooms = new Set(board.plan.rooms.map((r) => r.id));

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
          // Deleted, or no longer in this challenge, since the schedule was saved.
          removed:
            !!a.entryDeletedAt || !planned.has(taskKey(a.entryId, a.challengeId)),
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
        })),
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
        const [updated] = await tx
          .update(judgingAppointments)
          .set({
            roomId: choice.roomId,
            startsAt: choice.startsAt,
            deadlineAt: choice.deadlineAt,
            endsAt: choice.endsAt,
            revision: sql`${judgingAppointments.revision} + 1`,
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
