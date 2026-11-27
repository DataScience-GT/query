import { describe, expect, it } from "vitest";
import { VOLUNTEER_BLOCKS, VOLUNTEER_ONLINE_BLOCKS } from "@query/db/constants";
import {
  volunteerBlockGroups,
  volunteerBlockLabel,
  volunteerDays,
  volunteerOnlineBlockGroups,
  volunteerOnlineBlockLabel,
} from "./volunteer-blocks";

// Hacklytics 2027 starts Friday, February 26 in Atlanta.
const start = "2027-02-26T22:00:00Z";

describe("volunteer time blocks", () => {
  it("names the weekend's days from the edition's start date", () => {
    expect(volunteerDays(start)).toEqual([
      "Friday, Feb 26",
      "Saturday, Feb 27",
      "Sunday, Feb 28",
    ]);
  });

  it("reads the start on the venue's calendar, not UTC", () => {
    // 03:00 UTC on the 27th is still Friday night in Atlanta.
    expect(volunteerDays("2027-02-27T03:00:00Z")[0]).toBe("Friday, Feb 26");
  });

  it("runs into the next month", () => {
    expect(volunteerDays("2027-02-27T17:00:00Z")).toEqual([
      "Saturday, Feb 27",
      "Sunday, Feb 28",
      "Monday, Mar 1",
    ]);
  });

  it("puts all nine blocks under three days, in order", () => {
    const groups = volunteerBlockGroups(start);
    expect(groups.map((g) => g.blocks.length)).toEqual([3, 4, 2]);
    expect(groups.flatMap((g) => g.blocks.map((b) => b.id))).toEqual(
      VOLUNTEER_BLOCKS.map((b) => b.id),
    );
  });

  it("labels a block with its day for a spreadsheet", () => {
    expect(volunteerBlockLabel("fri_setup", start)).toBe(
      "Friday, Feb 26: Afternoon setup",
    );
    expect(volunteerBlockLabel("sun_closing", start)).toBe(
      "Sunday, Feb 28: Closing and teardown",
    );
    // An id the form no longer offers still reads as something.
    expect(volunteerBlockLabel("retired_block", start)).toBe("retired_block");
  });

  it("groups the nine online mentoring hours under the same three days", () => {
    const groups = volunteerOnlineBlockGroups(start);
    expect(groups.map((g) => g.heading)).toEqual(volunteerDays(start));
    expect(groups.map((g) => g.blocks.length)).toEqual([2, 5, 2]);
    expect(groups.flatMap((g) => g.blocks.map((b) => b.id))).toEqual(
      VOLUNTEER_ONLINE_BLOCKS.map((b) => b.id),
    );
  });

  it("labels an online block with its day and the zone it is in", () => {
    expect(volunteerOnlineBlockLabel("o_fri_evening", start)).toBe(
      "Friday, Feb 26: 6 to 10 pm ET",
    );
    expect(volunteerOnlineBlockLabel("o_sat_late", start)).toBe(
      "Saturday, Feb 27: 10 pm to 2 am ET",
    );
    expect(volunteerOnlineBlockLabel("retired", start)).toBe("retired");
  });
});
