import { describe, expect, it } from "vitest";
import { evaluationTiming } from "./timing";
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

  it("keeps a submitted evaluation editable, whatever the clock says", () => {
    expect(
      evaluationTiming(
        scheduled({
          evaluation: { appointmentId: "appt-1" },
          presenceChallengeId: null,
        }),
        before,
      ),
    ).toEqual({ canEdit: true, deadlineAt: null, appointmentId: "appt-1" });
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

  it("drops the deadline once it has passed, still tied to the slot", () => {
    expect(evaluationTiming(scheduled(), afterDeadline)).toEqual({
      canEdit: true,
      deadlineAt: null,
      appointmentId: "appt-1",
    });
    expect(evaluationTiming(scheduled(), deadlineAt)).toMatchObject({
      deadlineAt: null,
    });
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
      ).toMatchObject({ canEdit: false, opensAt: null });
    }
  });

  it("refuses a project the schedule has no slot for", () => {
    const timing = evaluationTiming(scheduled({ appointment: null }), during);
    expect(timing.canEdit).toBe(false);
    if (!timing.canEdit) expect(timing.reason).toMatch(/no presentation slot/);
  });
});
