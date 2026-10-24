import { describe, it, expect } from "vitest";
import {
  eventDateParts,
  eventWhenWhere,
  sessionTitle,
  splitByDay,
  termLabel,
} from "./public-events";

describe("termLabel", () => {
  it("reads a stored term as a season and year", () => {
    expect(termLabel("2026-fall")).toBe("Fall 2026");
    expect(termLabel("2027-spring")).toBe("Spring 2027");
  });

  it("leaves an unreadable term as written", () => {
    expect(termLabel("fall")).toBe("fall");
  });
});

describe("eventDateParts", () => {
  it("uses Atlanta time, not the server's", () => {
    // 22:30 UTC on 27 October is 6:30 PM EDT, the same Tuesday.
    const parts = eventDateParts(new Date("2026-10-27T22:30:00Z"));
    expect(parts).toMatchObject({ month: "Oct", day: "27", weekday: "Tuesday" });
    expect(parts.time).toBe("6:30 PM EDT");
  });

  it("does not move a late-evening event to the next day", () => {
    // 02:00 UTC on the 28th is still the 27th in Atlanta.
    expect(eventDateParts(new Date("2026-10-28T02:00:00Z")).day).toBe("27");
  });
});

describe("eventWhenWhere", () => {
  const date = new Date("2026-10-27T22:30:00Z");

  it("joins time and place", () => {
    expect(eventWhenWhere(date, "D.M. Smith 115")).toBe(
      "Tuesday, 6:30 PM EDT · D.M. Smith 115",
    );
  });

  it("omits the place when there is none", () => {
    expect(eventWhenWhere(date, null)).toBe("Tuesday, 6:30 PM EDT");
  });
});

describe("sessionTitle", () => {
  it("drops the week prefix the page already shows", () => {
    expect(sessionTitle("Bootcamp week 6: deep learning")).toBe("Deep learning");
    expect(sessionTitle("bootcamp week 2 - Linear regression")).toBe(
      "Linear regression",
    );
  });

  it("keeps a title that has no prefix", () => {
    expect(sessionTitle("Kickoff night")).toBe("Kickoff night");
  });

  it("keeps a title that is only the prefix", () => {
    expect(sessionTitle("Bootcamp week 3:")).toBe("Bootcamp week 3:");
  });
});

describe("splitByDay", () => {
  const from = new Date("2026-10-24T04:00:00Z");
  const row = (iso: string) => ({ eventDate: new Date(iso) });

  it("orders upcoming soonest first and past most recent first", () => {
    const { upcoming, past } = splitByDay(
      [
        row("2026-11-03T23:30:00Z"),
        row("2026-10-06T22:30:00Z"),
        row("2026-10-27T22:30:00Z"),
        row("2026-10-20T22:30:00Z"),
      ],
      from,
    );
    expect(upcoming.map((r) => r.eventDate.toISOString())).toEqual([
      "2026-10-27T22:30:00.000Z",
      "2026-11-03T23:30:00.000Z",
    ]);
    expect(past.map((r) => r.eventDate.toISOString())).toEqual([
      "2026-10-20T22:30:00.000Z",
      "2026-10-06T22:30:00.000Z",
    ]);
  });

  it("counts a row starting exactly at the boundary as upcoming", () => {
    const { upcoming, past } = splitByDay([{ eventDate: from }], from);
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });
});
