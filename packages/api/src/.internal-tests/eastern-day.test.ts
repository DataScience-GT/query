import { describe, expect, it } from "vitest";
import { startOfEasternDay } from "../routers/admin";

describe("startOfEasternDay", () => {
  it.each([
    // Evening in Atlanta is already tomorrow in UTC; today still began at
    // Eastern midnight.
    ["2026-09-25T00:30:00Z", "2026-09-24T04:00:00.000Z"],
    ["2026-12-25T03:00:00Z", "2026-12-24T05:00:00.000Z"],
    // The DST days: midnight is before the 2am switch, so it keeps the
    // offset the day started with.
    ["2026-03-08T20:00:00Z", "2026-03-08T05:00:00.000Z"],
    ["2026-11-01T20:00:00Z", "2026-11-01T04:00:00.000Z"],
  ])("%s starts its Eastern day at %s", (now, expected) => {
    expect(startOfEasternDay(new Date(now)).toISOString()).toBe(expected);
  });
});
