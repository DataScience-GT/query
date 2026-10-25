import { describe, it, expect } from "vitest";
import {
  bootcampSummary,
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

describe("bootcampSummary", () => {
  const fallback = { startDate: "Oct 6", time: "6:30 PM", room: "CODA C1115" };
  // 22:30 UTC is 6:30 PM EDT in October.
  const moved = { eventDate: new Date("2026-10-29T22:30:00Z"), location: "Klaus 1456" };
  const old = { eventDate: new Date("2026-10-13T22:30:00Z"), location: "Klaus 1456" };

  it("shows the fallbacks as the first session before any is posted", () => {
    const facts = bootcampSummary({ upcoming: [], past: [] }, fallback);
    expect(facts).toEqual([
      { label: "First session", value: "Oct 6" },
      { label: "Time", value: "6:30 PM" },
      { label: "Room", value: "CODA C1115" },
    ]);
  });

  it("takes date, time and room from the next session itself", () => {
    const facts = bootcampSummary({ upcoming: [moved], past: [old] }, fallback);
    expect(facts).toEqual([
      { label: "Next session", value: "Oct 29" },
      { label: "Time", value: "6:30 PM EDT" },
      { label: "Room", value: "Klaus 1456" },
    ]);
  });

  it("falls back to the default room when the session has none", () => {
    const facts = bootcampSummary(
      { upcoming: [{ ...moved, location: null }], past: [] },
      fallback,
    );
    expect(facts[2]).toEqual({ label: "Room", value: "CODA C1115" });
  });

  it("says the sessions have ended instead of showing a stale date", () => {
    const facts = bootcampSummary({ upcoming: [], past: [old] }, fallback);
    expect(facts).toEqual([
      { label: "Last session", value: "Oct 13" },
      { label: "Status", value: "This term's sessions have ended" },
    ]);
  });
});
