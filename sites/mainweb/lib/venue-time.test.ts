import { describe, expect, it } from "vitest";
import {
  venueDayNumber,
  venueFormat,
  venueParts,
} from "./venue-time";

// 2026-11-06 03:30 UTC is still the evening of the 5th in Atlanta, the
// morning of the 6th in Auckland and the afternoon of the 5th in Los Angeles.
const LATE_NIGHT_UTC = new Date("2026-11-06T03:30:00Z");

describe("venueFormat", () => {
  it("prints the venue's day, not the runtime's", () => {
    expect(venueFormat(LATE_NIGHT_UTC, { month: "short", day: "numeric" })).toBe(
      "Nov 5",
    );
  });

  it("defaults to the numeric en-US date", () => {
    expect(venueFormat(LATE_NIGHT_UTC)).toBe("11/5/2026");
  });

  it("takes strings and timestamps", () => {
    expect(venueFormat("2026-11-06T03:30:00Z")).toBe("11/5/2026");
    expect(venueFormat(LATE_NIGHT_UTC.getTime())).toBe("11/5/2026");
  });

  it("follows daylight saving", () => {
    const hour = { hour: "numeric", minute: "2-digit" } as const;
    expect(venueFormat("2026-07-01T16:00:00Z", hour)).toBe("12:00 PM");
    expect(venueFormat("2026-12-01T16:00:00Z", hour)).toBe("11:00 AM");
  });
});

describe("venueParts", () => {
  it("splits the venue's date", () => {
    expect(venueParts(LATE_NIGHT_UTC)).toEqual({ year: 2026, month: 11, day: 5 });
  });

  it("rolls the year at the venue's midnight", () => {
    expect(venueParts("2027-01-01T04:59:00Z").year).toBe(2026);
    expect(venueParts("2027-01-01T05:00:00Z").year).toBe(2027);
  });
});

describe("venueDayNumber", () => {
  it("is the same all day at the venue and steps at its midnight", () => {
    const before = venueDayNumber("2026-11-06T04:59:00Z");
    const after = venueDayNumber("2026-11-06T05:00:00Z");
    expect(after - before).toBe(1);
    expect(venueDayNumber("2026-11-06T23:00:00Z")).toBe(after);
  });

  it("counts whole days across a month and a clock change", () => {
    expect(
      venueDayNumber("2026-11-08T12:00:00Z") -
        venueDayNumber("2026-10-31T12:00:00Z"),
    ).toBe(8);
  });
});
