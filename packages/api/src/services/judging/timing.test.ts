import { describe, expect, it } from "vitest";
import { DEADLINE_GRACE_MS, evaluationTiming } from "./timing";
import type { TimingInput } from "./timing";

const startsAt = new Date("2027-02-08T15:00:00Z");
const deadlineAt = new Date("2027-02-08T15:08:00Z");
const before = new Date("2027-02-08T14:55:00Z");
const during = new Date("2027-02-08T15:03:00Z");
const afterDeadline = new Date("2027-02-08T15:09:00Z");

const scheduled = (over: Partial<TimingInput> = {}): TimingInput => ({
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
        deadlineAt: null,
      });
      expect(evaluationTiming(write, pastGrace)).toMatchObject({
        canEdit: false,
        ended: true,
      });
      expect(evaluationTiming(scheduled({ evaluation }), inGrace)).toMatchObject(
        { canEdit: false, ended: true },
      );
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
