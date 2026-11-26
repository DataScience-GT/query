import { describe, expect, it } from "vitest";

import { overlapsRamadan } from "./ramadan";

// Ramadan 2027 runs from 2027-02-08 to 2027-03-08 on the Umm al-Qura calendar.
describe("overlapsRamadan", () => {
  it("is true for Hacklytics, 26 to 28 February 2027", () => {
    expect(
      overlapsRamadan("2027-02-26T14:00:00Z", "2027-02-28T22:00:00Z"),
    ).toBe(true);
  });

  it("is false for an event in September 2027", () => {
    expect(
      overlapsRamadan("2027-09-17T14:00:00Z", "2027-09-19T22:00:00Z"),
    ).toBe(false);
  });

  it("is true when the event starts before Ramadan and ends inside it", () => {
    expect(
      overlapsRamadan("2027-02-05T14:00:00Z", "2027-02-09T22:00:00Z"),
    ).toBe(true);
  });

  it("is true when the event starts inside Ramadan and ends after it", () => {
    expect(
      overlapsRamadan("2027-03-07T14:00:00Z", "2027-03-12T22:00:00Z"),
    ).toBe(true);
  });

  it("is true when the event spans the whole month", () => {
    expect(
      overlapsRamadan("2027-02-01T00:00:00Z", "2027-03-31T00:00:00Z"),
    ).toBe(true);
  });

  it("is false for an event that ends the day before Ramadan or starts the day after", () => {
    expect(
      overlapsRamadan("2027-02-05T14:00:00Z", "2027-02-07T22:00:00Z"),
    ).toBe(false);
    expect(
      overlapsRamadan("2027-03-10T14:00:00Z", "2027-03-12T22:00:00Z"),
    ).toBe(false);
  });

  it("counts days at the venue, not in UTC", () => {
    // 04:59 UTC on the 8th is 23:59 on the 7th in Atlanta; 05:00 is the 8th.
    expect(
      overlapsRamadan("2027-02-06T12:00:00Z", "2027-02-08T04:59:00Z"),
    ).toBe(false);
    expect(
      overlapsRamadan("2027-02-06T12:00:00Z", "2027-02-08T05:00:00Z"),
    ).toBe(true);
  });

  it("is true for a span longer than a year, wherever it starts", () => {
    expect(
      overlapsRamadan("2027-09-01T00:00:00Z", "2028-09-01T00:00:00Z"),
    ).toBe(true);
  });

  it("takes Dates and timestamps, and treats a single instant as one day", () => {
    const inside = new Date("2027-02-26T14:00:00Z");
    expect(overlapsRamadan(inside, inside)).toBe(true);
    expect(overlapsRamadan(inside.getTime(), inside.getTime())).toBe(true);
    const outside = new Date("2027-09-17T14:00:00Z");
    expect(overlapsRamadan(outside, outside)).toBe(false);
  });

  it("is false for dates that do not parse", () => {
    expect(overlapsRamadan("not a date", "2027-02-26T14:00:00Z")).toBe(false);
  });
});
