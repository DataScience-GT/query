import { describe, expect, it } from "vitest";
import { appointmentStatus } from "./appointment-status";

const startsAt = new Date("2027-02-08T15:00:00Z");
const endsAt = new Date("2027-02-08T15:10:00Z");
const before = new Date("2027-02-08T14:59:00Z");
const during = new Date("2027-02-08T15:04:00Z");
const after = new Date("2027-02-08T15:10:00Z");

describe("appointmentStatus", () => {
  it("follows the clock while nothing is submitted", () => {
    const slot = { startsAt, endsAt, evaluations: [] };
    expect(appointmentStatus(slot, before)).toBe("future");
    expect(appointmentStatus(slot, during)).toBe("pending");
    expect(appointmentStatus(slot, after)).toBe("missed");
  });

  it("is complete when every submitted evaluation holds every rating", () => {
    const slot = {
      startsAt,
      endsAt,
      evaluations: [
        { judgeId: "a", ratingsComplete: true },
        { judgeId: "b", ratingsComplete: true },
      ],
    };
    expect(appointmentStatus(slot, during)).toBe("complete");
    expect(appointmentStatus(slot, after)).toBe("complete");
  });

  it("is incomplete when an evaluation was auto-submitted short of a rating", () => {
    const slot = {
      startsAt,
      endsAt,
      evaluations: [
        { judgeId: "a", ratingsComplete: true },
        { judgeId: "b", ratingsComplete: false },
      ],
    };
    expect(appointmentStatus(slot, after)).toBe("incomplete");
  });

  it("lets evaluations outrank the clock", () => {
    const slot = {
      startsAt,
      endsAt,
      evaluations: [{ judgeId: "a", ratingsComplete: true }],
    };
    expect(appointmentStatus(slot, before)).toBe("complete");
  });
});
