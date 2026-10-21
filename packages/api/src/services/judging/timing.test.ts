import { describe, expect, it } from "vitest";
import {
  DEADLINE_GRACE_MS,
  TAKEOVER_AFTER_MS,
  evaluationTiming,
  reservedUntil,
  takeoverAt,
} from "./timing";
import type { TimingInput } from "./timing";

const startsAt = new Date("2027-02-08T15:00:00Z");
const deadlineAt = new Date("2027-02-08T15:08:00Z");
const before = new Date("2027-02-08T14:55:00Z");
const during = new Date("2027-02-08T15:03:00Z");
const afterDeadline = new Date("2027-02-08T15:09:00Z");

const scheduled = (over: Partial<TimingInput> = {}): TimingInput => ({
  judgeId: "judge-a",
  hasSchedule: true,
  mode: "scheduled",
  challengeId: "general",
  evaluation: null,
  appointment: { id: "appt-1", startsAt, deadlineAt },
  presenceChallengeId: "general",
  ...over,
});

describe("evaluationTiming", () => {
  it("is untimed before any schedule is saved", () => {
    expect(
      evaluationTiming(
        scheduled({
          hasSchedule: false,
          appointment: null,
          presenceChallengeId: null,
        }),
        before,
      ),
    ).toEqual({ canEdit: true, deadlineAt: null, appointmentId: null });
  });

  it("is untimed for unscheduled and remote challenges", () => {
    for (const mode of ["unscheduled", "remote"] as const) {
      expect(
        evaluationTiming(
          scheduled({ mode, appointment: null, presenceChallengeId: null }),
          before,
        ),
      ).toEqual({ canEdit: true, deadlineAt: null, appointmentId: null });
    }
  });

  it("keeps a submitted evaluation editable until the deadline", () => {
    for (const now of [before, during]) {
      expect(
        evaluationTiming(
          scheduled({
            evaluation: { appointmentId: "appt-1" },
            presenceChallengeId: null,
          }),
          now,
        ),
      ).toEqual({ canEdit: true, deadlineAt, appointmentId: "appt-1" });
    }
  });

  it("gives a write DEADLINE_GRACE_MS past the deadline, and a read none", () => {
    const inGrace = new Date(deadlineAt.getTime() + DEADLINE_GRACE_MS - 1);
    const pastGrace = new Date(deadlineAt.getTime() + DEADLINE_GRACE_MS);
    for (const evaluation of [null, { appointmentId: "appt-1" }]) {
      const write = scheduled({ evaluation, graceMs: DEADLINE_GRACE_MS });
      expect(evaluationTiming(write, inGrace)).toMatchObject({
        canEdit: true,
      });
      expect(evaluationTiming(write, pastGrace)).toMatchObject({
        canEdit: false,
        ended: true,
      });
      expect(
        evaluationTiming(scheduled({ evaluation }), inGrace),
      ).toMatchObject({ canEdit: false, ended: true });
    }
  });

  it("still reports the deadline to a write in the grace window", () => {
    // The deadline is already past, but a draft first saved now still has to
    // carry it, or nothing submits the draft for the judge.
    const inGrace = new Date(deadlineAt.getTime() + DEADLINE_GRACE_MS - 1);
    for (const evaluation of [null, { appointmentId: "appt-1" }]) {
      const timing = evaluationTiming(
        scheduled({ evaluation, graceMs: DEADLINE_GRACE_MS }),
        inGrace,
      );
      expect(timing).toEqual({
        canEdit: true,
        deadlineAt,
        appointmentId: "appt-1",
      });
    }
  });

  it("locks a submitted evaluation once the deadline passes", () => {
    for (const now of [deadlineAt, afterDeadline]) {
      const timing = evaluationTiming(
        scheduled({ evaluation: { appointmentId: "appt-1" } }),
        now,
      );
      expect(timing).toMatchObject({ canEdit: false, ended: true });
      if (!timing.canEdit) expect(timing.reason).toMatch(/final/);
    }
  });

  it("keeps an untimed evaluation editable after any clock", () => {
    expect(
      evaluationTiming(
        scheduled({
          mode: "remote",
          evaluation: { appointmentId: null },
        }),
        afterDeadline,
      ),
    ).toEqual({ canEdit: true, deadlineAt: null, appointmentId: null });
  });

  it("runs against the deadline during the presentation", () => {
    expect(evaluationTiming(scheduled(), during)).toEqual({
      canEdit: true,
      deadlineAt,
      appointmentId: "appt-1",
    });
    expect(evaluationTiming(scheduled(), startsAt)).toMatchObject({
      canEdit: true,
      deadlineAt,
    });
  });

  it("refuses a first evaluation once the deadline passes", () => {
    for (const now of [deadlineAt, afterDeadline]) {
      expect(evaluationTiming(scheduled(), now)).toMatchObject({
        canEdit: false,
        opensAt: null,
        ended: true,
      });
    }
    // The deadline wins over the room: there is nothing left to join.
    expect(
      evaluationTiming(scheduled({ presenceChallengeId: null }), afterDeadline),
    ).toMatchObject({ canEdit: false, ended: true });
  });

  it("waits for the presentation to start", () => {
    expect(evaluationTiming(scheduled(), before)).toMatchObject({
      canEdit: false,
      opensAt: startsAt,
    });
  });

  it("needs the judge in a room serving the challenge", () => {
    for (const presenceChallengeId of [null, "mlh"]) {
      expect(
        evaluationTiming(scheduled({ presenceChallengeId }), during),
      ).toMatchObject({ canEdit: false, opensAt: null, ended: false });
    }
  });

  it("refuses a project the schedule has no slot for", () => {
    const timing = evaluationTiming(scheduled({ appointment: null }), during);
    expect(timing.canEdit).toBe(false);
    if (!timing.canEdit) expect(timing.reason).toMatch(/no presentation slot/);
  });
});

describe("TAKEOVER_AFTER_MS", () => {
  it("is five minutes", () => {
    expect(TAKEOVER_AFTER_MS).toBe(5 * 60_000);
    expect(takeoverAt(startsAt)).toEqual(new Date("2027-02-08T15:05:00Z"));
  });
});

describe("reservedUntil", () => {
  const assigned = { startsAt, assignedJudgeId: "judge-b" };
  const takeover = takeoverAt(startsAt);

  it("is the takeover time while a presentation is kept for another judge", () => {
    for (const now of [before, startsAt, during]) {
      expect(reservedUntil(assigned, "judge-a", now)).toEqual(takeover);
    }
  });

  it("is over from the takeover time on", () => {
    expect(
      reservedUntil(assigned, "judge-a", new Date(takeover.getTime() - 1)),
    ).toEqual(takeover);
    expect(reservedUntil(assigned, "judge-a", takeover)).toBeNull();
    expect(reservedUntil(assigned, "judge-a", afterDeadline)).toBeNull();
  });

  it("keeps nothing from the judge it is assigned to", () => {
    expect(reservedUntil(assigned, "judge-b", during)).toBeNull();
  });

  it("keeps nothing when nobody is assigned", () => {
    expect(reservedUntil({ startsAt }, "judge-a", during)).toBeNull();
    expect(
      reservedUntil({ startsAt, assignedJudgeId: null }, "judge-a", during),
    ).toBeNull();
    expect(reservedUntil(null, "judge-a", during)).toBeNull();
  });
});

describe("evaluationTiming for an assigned presentation", () => {
  const appointment = (assignedJudgeId: string | null) => ({
    id: "appt-1",
    startsAt,
    deadlineAt,
    assignedJudgeId,
  });
  const mine = scheduled({ appointment: appointment("judge-a") });
  const theirs = scheduled({ appointment: appointment("judge-b") });
  const takeover = takeoverAt(startsAt);

  it("is the assigned judge's from the start", () => {
    expect(evaluationTiming(mine, startsAt)).toEqual({
      canEdit: true,
      deadlineAt,
      appointmentId: "appt-1",
    });
    expect(evaluationTiming(mine, before)).toMatchObject({
      canEdit: false,
      opensAt: startsAt,
    });
  });

  it("keeps another judge out until the takeover time, and says when it opens", () => {
    for (const now of [before, startsAt, during]) {
      const timing = evaluationTiming(theirs, now);
      expect(timing).toMatchObject({
        canEdit: false,
        opensAt: takeover,
        ended: false,
      });
    }
  });

  it("tells another judge why without saying who", () => {
    const timing = evaluationTiming(theirs, during);
    if (timing.canEdit) throw new Error("expected a refusal");
    expect(timing.reason).toBe(
      "Another judge is assigned to this presentation. If they have not started 5 minutes in, you can take it.",
    );
    expect(timing.reason).not.toContain("judge-b");
  });

  it("lets another judge take it from the takeover time", () => {
    expect(evaluationTiming(theirs, takeover)).toEqual({
      canEdit: true,
      deadlineAt,
      appointmentId: "appt-1",
    });
    expect(
      evaluationTiming(theirs, new Date(takeover.getTime() - 1)),
    ).toMatchObject({ canEdit: false, opensAt: takeover });
  });

  it("still needs the judge who takes over in a room serving the challenge", () => {
    expect(
      evaluationTiming({ ...theirs, presenceChallengeId: "mlh" }, takeover),
    ).toMatchObject({ canEdit: false, opensAt: null, ended: false });
  });

  it("names the reservation before the room: joining one does not help yet", () => {
    expect(
      evaluationTiming({ ...theirs, presenceChallengeId: null }, during),
    ).toMatchObject({ canEdit: false, opensAt: takeover });
  });

  it("is a first-come presentation when nobody is assigned", () => {
    const open = scheduled({ appointment: appointment(null) });
    expect(evaluationTiming(open, startsAt)).toMatchObject({ canEdit: true });
  });

  it("lets the end win over the reservation", () => {
    const short = scheduled({
      appointment: {
        id: "appt-1",
        startsAt,
        deadlineAt: new Date("2027-02-08T15:03:00Z"),
        assignedJudgeId: "judge-b",
      },
    });
    expect(
      evaluationTiming(short, new Date("2027-02-08T15:04:00Z")),
    ).toMatchObject({ canEdit: false, ended: true });
  });

  it("leaves a judge's own evaluation theirs, whoever it was assigned to", () => {
    expect(
      evaluationTiming(
        { ...theirs, evaluation: { appointmentId: "appt-1" } },
        during,
      ),
    ).toEqual({ canEdit: true, deadlineAt, appointmentId: "appt-1" });
  });

  it("ignores an assignment where nothing is timed", () => {
    for (const over of [
      { mode: "remote" as const },
      { mode: "unscheduled" as const },
      { hasSchedule: false },
    ]) {
      expect(evaluationTiming({ ...theirs, ...over }, during)).toMatchObject({
        canEdit: true,
        deadlineAt: null,
      });
    }
  });
});
