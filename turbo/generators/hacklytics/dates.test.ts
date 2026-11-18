import { describe, expect, it } from "vitest";

import {
  applyPattern,
  boardTime,
  isoAt,
  parseDay,
  patternOf,
  sameMomentInYear,
} from "./dates";

const ZONE = "America/New_York";
const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) => ({
  year,
  month,
  day,
  hour,
  minute,
});

describe("isoAt", () => {
  it("writes the offset in force on that date, not on today's", () => {
    expect(isoAt(at(2099, 2, 26, 17), ZONE)).toBe("2099-02-26T17:00:00-05:00");
    expect(isoAt(at(2099, 7, 4, 17), ZONE)).toBe("2099-07-04T17:00:00-04:00");
  });

  it("switches offset at the hour daylight saving starts and ends", () => {
    expect(isoAt(at(2027, 3, 14, 1, 59), ZONE)).toBe(
      "2027-03-14T01:59:00-05:00",
    );
    expect(isoAt(at(2027, 3, 14, 3), ZONE)).toBe("2027-03-14T03:00:00-04:00");
    expect(isoAt(at(2027, 11, 7, 3), ZONE)).toBe("2027-11-07T03:00:00-05:00");
  });

  it("refuses a wall-clock time the zone skips", () => {
    expect(() => isoAt(at(2027, 3, 14, 2, 30), ZONE)).toThrow(/does not exist/);
  });
});

describe("a schedule pattern", () => {
  const february = {
    start: "2027-02-26T17:00:00-05:00",
    end: "2027-02-28T16:00:00-05:00",
    hacking: {
      start: "2027-02-26T21:00:00-05:00",
      end: "2027-02-28T09:00:00-05:00",
    },
  };
  const pattern = patternOf(february, ZONE);

  it("reads clock times and day offsets from an edition", () => {
    expect(pattern).toEqual({
      start: "17:00",
      end: "16:00",
      hackStart: { days: 0, clock: "21:00" },
      hackEnd: { days: 0, clock: "09:00" },
    });
  });

  it("lays the same pattern back onto the same dates", () => {
    expect(
      applyPattern(
        pattern,
        parseDay("2027-02-26")!,
        parseDay("2027-02-28")!,
        ZONE,
      ),
    ).toEqual(february);
  });

  it("keeps the clock times on a weekend in daylight time, with that weekend's offset", () => {
    expect(
      applyPattern(
        pattern,
        parseDay("2099-03-26")!,
        parseDay("2099-03-28")!,
        ZONE,
      ),
    ).toEqual({
      start: "2099-03-26T17:00:00-04:00",
      end: "2099-03-28T16:00:00-04:00",
      hacking: {
        start: "2099-03-26T21:00:00-04:00",
        end: "2099-03-28T09:00:00-04:00",
      },
    });
  });

  it("follows a pattern whose hacking ends the day after the end date", () => {
    const overnight = patternOf(
      {
        start: "2027-02-26T17:00:00-05:00",
        end: "2027-02-28T16:00:00-05:00",
        hacking: {
          start: "2027-02-27T00:00:00-05:00",
          end: "2027-02-27T12:00:00-05:00",
        },
      },
      ZONE,
    );
    expect(overnight.hackStart).toEqual({ days: 1, clock: "00:00" });
    expect(overnight.hackEnd).toEqual({ days: -1, clock: "12:00" });
  });
});

describe("parseDay", () => {
  it("accepts real dates only", () => {
    expect(parseDay("2099-02-28")).toEqual({ year: 2099, month: 2, day: 28 });
    expect(parseDay("2099-02-30")).toBeNull();
    expect(parseDay("2099-2-3")).toBeNull();
    expect(parseDay("Feb 26")).toBeNull();
  });
});

describe("sameMomentInYear", () => {
  it("moves a moment to another year with that date's offset", () => {
    expect(sameMomentInYear("2026-08-01T00:00:00-04:00", 2098, ZONE)).toBe(
      "2098-08-01T00:00:00-04:00",
    );
    expect(sameMomentInYear("2026-12-01T09:00:00-05:00", 2098, ZONE)).toBe(
      "2098-12-01T09:00:00-05:00",
    );
  });

  it("lands Feb 29 on Feb 28 in a year with no leap day", () => {
    expect(sameMomentInYear("2028-02-29T00:00:00-05:00", 2029, ZONE)).toBe(
      "2029-02-28T00:00:00-05:00",
    );
  });
});

describe("boardTime", () => {
  it("writes a clock the way the schedule board does", () => {
    expect(boardTime("17:00")).toBe("5:00 PM");
    expect(boardTime("09:00")).toBe("9:00 AM");
    expect(boardTime("00:30")).toBe("12:30 AM");
    expect(boardTime("12:00")).toBe("12:00 PM");
  });
});
