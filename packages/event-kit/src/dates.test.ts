import { describe, expect, it } from "vitest";
import { calendarDaysUntil, deadlineStatus, defaultDayIndex, describeMoment } from "./dates";

const NY = "America/New_York";
const at = (iso: string) => Date.parse(iso);

describe("describeMoment", () => {
  it("reads the instant off the venue's clock", () => {
    expect(describeMoment(NY, at("2027-02-26T21:00:00-05:00"))).toEqual({
      weekday: "Fri",
      label: "Feb 26",
      long: "February 26",
      year: 2027,
      time: "9:00 PM",
      zone: "EST",
    });
  });

  it("names the day in the venue's zone, whatever zone the timestamp is written in", () => {
    // 3:59 AM UTC on the 21st is still the evening of the 20th in New York.
    const moment = describeMoment(NY, at("2027-01-21T04:59:00Z"));
    expect(moment).toMatchObject({ weekday: "Wed", label: "Jan 20", time: "11:59 PM" });
  });

  it("uses daylight time when the venue is on it", () => {
    expect(describeMoment(NY, at("2027-03-20T12:00:00-04:00")).zone).toBe("EDT");
  });
});

describe("calendarDaysUntil", () => {
  const closes = at("2027-01-20T23:59:00-05:00");

  it("counts the calendar days between the two dates", () => {
    expect(calendarDaysUntil(NY, closes, at("2026-11-25T12:00:00-05:00"))).toBe(56);
    expect(calendarDaysUntil(NY, closes, at("2027-01-19T08:00:00-05:00"))).toBe(1);
    expect(calendarDaysUntil(NY, closes, at("2027-01-20T08:00:00-05:00"))).toBe(0);
  });

  it("turns over at midnight in the venue, not in UTC", () => {
    // 02:00 UTC on the 20th is 9 PM on the 19th in New York: one day left.
    expect(calendarDaysUntil(NY, closes, at("2027-01-20T02:00:00Z"))).toBe(1);
    // 05:00 UTC is midnight in New York: the day has turned.
    expect(calendarDaysUntil(NY, closes, at("2027-01-20T05:00:00Z"))).toBe(0);
  });

  it("counts a day with a clock change in it as one day", () => {
    // 23.5 hours apart, because the clocks went forward in between.
    const now = at("2027-03-13T23:30:00-05:00");
    const target = at("2027-03-14T23:59:00-04:00");
    expect(calendarDaysUntil(NY, target, now)).toBe(1);
  });

  it("is negative after the day", () => {
    expect(calendarDaysUntil(NY, closes, at("2027-01-22T12:00:00-05:00"))).toBe(-2);
  });
});

describe("deadlineStatus", () => {
  const closes = at("2027-01-20T23:59:00-05:00");
  const status = (nowIso: string) => deadlineStatus(NY, closes, at(nowIso));

  it("says how many days are left", () => {
    expect(status("2026-11-25T12:00:00-05:00")).toEqual({ open: true, days: 56, left: "56 days left" });
  });

  it("says 1 day, not 1 days", () => {
    expect(status("2027-01-19T12:00:00-05:00")).toEqual({ open: true, days: 1, left: "1 day left" });
  });

  it("calls the last day the last day, up to the minute", () => {
    expect(status("2027-01-20T00:00:00-05:00")).toEqual({ open: true, days: 0, left: "last day" });
    expect(status("2027-01-20T23:58:59-05:00")).toEqual({ open: true, days: 0, left: "last day" });
  });

  it("is closed from the closing instant on, so the page never promises a deadline that has gone", () => {
    expect(status("2027-01-20T23:59:00-05:00")).toEqual({ open: false });
    expect(status("2027-02-01T12:00:00-05:00")).toEqual({ open: false });
  });
});

describe("defaultDayIndex", () => {
  const keys = ["Fri", "Sat", "Sun"];
  const start = at("2027-02-26T17:00:00-05:00");
  const end = at("2027-02-28T16:00:00-05:00");
  const index = (nowIso: string) => defaultDayIndex(keys, NY, start, end, at(nowIso));

  it("opens on the first day before the event", () => {
    expect(index("2026-11-25T12:00:00-05:00")).toBe(0);
    expect(index("2027-02-26T16:59:00-05:00")).toBe(0);
  });

  it("opens on today's day while the event is on", () => {
    expect(index("2027-02-26T18:00:00-05:00")).toBe(0);
    expect(index("2027-02-27T12:00:00-05:00")).toBe(1);
    expect(index("2027-02-28T10:00:00-05:00")).toBe(2);
  });

  it("opens on the first day again once the event is over", () => {
    expect(index("2027-02-28T16:00:00-05:00")).toBe(0);
    expect(index("2027-03-05T12:00:00-05:00")).toBe(0);
  });

  it("goes by the venue's day, not the visitor's", () => {
    // 03:00 UTC on Saturday is 10 PM Friday in Atlanta.
    expect(index("2027-02-27T03:00:00Z")).toBe(0);
    // 05:30 UTC is 12:30 AM Saturday in Atlanta.
    expect(index("2027-02-27T05:30:00Z")).toBe(1);
  });

  it("opens on the first day when today is not one of the days", () => {
    expect(defaultDayIndex(["Fri", "Sat"], NY, start, end, at("2027-02-28T10:00:00-05:00"))).toBe(0);
  });
});
