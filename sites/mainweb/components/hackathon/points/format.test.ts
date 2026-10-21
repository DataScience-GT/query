import { describe, expect, it } from "vitest";
import {
  attendanceMethodLabel,
  ordinal,
  pointsLabel,
  signedPoints,
  venueRange,
} from "./format";

describe("ordinal", () => {
  it("uses st, nd, rd and th the way English does", () => {
    expect([1, 2, 3, 4, 10].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "10th",
    ]);
    expect([11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });
});

describe("points", () => {
  it("says point for one and points otherwise", () => {
    expect(pointsLabel(1)).toBe("1 point");
    expect(pointsLabel(-1)).toBe("-1 point");
    expect(pointsLabel(0)).toBe("0 points");
    expect(pointsLabel(1250)).toBe("1,250 points");
  });

  it("always shows the sign of a ledger amount", () => {
    expect(signedPoints(50)).toBe("+50");
    expect(signedPoints(-1200)).toBe("−1,200");
    expect(signedPoints(0)).toBe("0");
  });
});

describe("venueRange", () => {
  it("reads on the venue's clock whatever the viewer's zone", () => {
    // 18:00 UTC is 2:00 PM in Atlanta during daylight saving time. Newer ICU
    // puts a narrow no-break space before PM.
    expect(
      venueRange(
        new Date("2026-10-17T18:00:00Z"),
        new Date("2026-10-17T20:00:00Z"),
      ).replace(/\u202f/g, " "),
    ).toBe("Sat 2:00 PM – 4:00 PM");
  });
});

describe("attendanceMethodLabel", () => {
  it("names every way a check-in is made, and nothing for old rows", () => {
    expect(attendanceMethodLabel("scan")).toBe("Pass scanned");
    expect(attendanceMethodLabel("code")).toBe("Event code");
    expect(attendanceMethodLabel("manual")).toBe("Checked in by staff");
    expect(attendanceMethodLabel(null)).toBeNull();
  });
});
