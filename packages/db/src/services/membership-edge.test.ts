import { describe, it, expect } from "vitest";
import {
  currentTerm,
  isBootcampAddOnOnly,
  paidForBootcamp,
  planFromMetadata,
  readPlan,
  semesterEndDate,
  splitName,
} from "./membership";

/**
 * Edges of the pure membership helpers.
 *
 * Every one of these functions is fed by Stripe metadata or by a name typed
 * into a form, so the interesting inputs are the malformed ones: metadata is a
 * free-form JSON string written by whichever path recorded the payment, and
 * some of those rows predate the fields being read out of them.
 *
 * `membership.test.ts` covers the ordinary path for each; this file covers
 * what happens at the boundaries and when the input is junk.
 */

describe("splitName — edges", () => {
  it("splits an ordinary two-part name", () => {
    expect(splitName("Ada Lovelace")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("keeps every trailing part as the surname", () => {
    expect(splitName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });

  /**
   * The reason this helper exists: a copied version in the Stripe webhook lost
   * a backslash and split on the letter "s", storing "Chris Smith" as
   * "Chri" / " Smith".
   */
  it("splits on whitespace, not on the letter s", () => {
    expect(splitName("Chris Smith")).toEqual({
      firstName: "Chris",
      lastName: "Smith",
    });
  });

  it("collapses runs of spaces", () => {
    expect(splitName("Ada    Lovelace")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("treats a tab as a separator", () => {
    expect(splitName("Ada\tLovelace")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("treats a newline as a separator", () => {
    expect(splitName("Ada\nLovelace")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("ignores surrounding whitespace", () => {
    expect(splitName("  Ada Lovelace  ")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("falls back for a whitespace-only name", () => {
    expect(splitName("   ")).toEqual({
      firstName: "Member",
      lastName: "Member",
    });
  });

  it("falls back for an empty string", () => {
    expect(splitName("")).toEqual({ firstName: "Member", lastName: "Member" });
  });

  it("falls back for null", () => {
    expect(splitName(null)).toEqual({
      firstName: "Member",
      lastName: "Member",
    });
  });

  it("falls back for undefined", () => {
    expect(splitName(undefined)).toEqual({
      firstName: "Member",
      lastName: "Member",
    });
  });

  it("gives a single name a fallback surname", () => {
    expect(splitName("Prince")).toEqual({
      firstName: "Prince",
      lastName: "Member",
    });
  });

  it("keeps accented characters intact", () => {
    expect(splitName("José Álvarez")).toEqual({
      firstName: "José",
      lastName: "Álvarez",
    });
  });

  it("keeps a non-Latin script intact", () => {
    expect(splitName("张 伟")).toEqual({ firstName: "张", lastName: "伟" });
  });

  it("treats a hyphenated surname as one part", () => {
    expect(splitName("Ada Lovelace-Byron")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace-Byron",
    });
  });

  it("keeps a particle in the surname", () => {
    expect(splitName("Vincent van Gogh")).toEqual({
      firstName: "Vincent",
      lastName: "van Gogh",
    });
  });

  it("does not choke on an emoji in the name", () => {
    const { firstName } = splitName("🎉 Party");
    expect(firstName).toBe("🎉");
  });

  it("handles a very long name without truncating the surname", () => {
    const long = `${"a".repeat(200)} ${"b".repeat(200)}`;
    expect(splitName(long).lastName).toHaveLength(200);
  });
});

describe("readPlan — edges", () => {
  it("reads the semester plan", () => {
    expect(readPlan("semester")).toBe("semester");
  });

  it("reads the annual plan", () => {
    expect(readPlan("annual")).toBe("annual");
  });

  /**
   * An exact match, deliberately. The value is a free-form string on a Stripe
   * object, and anything unrecognised has to fall back to the plan that was
   * the only one on offer when the older rows were written.
   */
  it("does not accept a differently-cased semester", () => {
    expect(readPlan("SEMESTER")).toBe("annual");
    expect(readPlan("Semester")).toBe("annual");
  });

  it("does not accept a padded semester", () => {
    expect(readPlan(" semester")).toBe("annual");
    expect(readPlan("semester ")).toBe("annual");
  });

  it("treats an unknown word as a year", () => {
    expect(readPlan("lifetime")).toBe("annual");
  });

  it("treats an empty string as a year", () => {
    expect(readPlan("")).toBe("annual");
  });

  it("treats null and undefined as a year", () => {
    expect(readPlan(null)).toBe("annual");
    expect(readPlan(undefined)).toBe("annual");
  });
});

describe("planFromMetadata — edges", () => {
  it("reads the plan out of a metadata blob", () => {
    expect(planFromMetadata(JSON.stringify({ plan: "semester" }))).toBe(
      "semester",
    );
  });

  it("falls back when the blob has no plan key", () => {
    expect(planFromMetadata(JSON.stringify({ bootcamp: "true" }))).toBe(
      "annual",
    );
  });

  it("falls back on malformed JSON rather than throwing", () => {
    expect(planFromMetadata("{not json")).toBe("annual");
  });

  it("falls back on an empty string", () => {
    expect(planFromMetadata("")).toBe("annual");
  });

  it("falls back on null and undefined", () => {
    expect(planFromMetadata(null)).toBe("annual");
    expect(planFromMetadata(undefined)).toBe("annual");
  });

  it("falls back when the blob is a JSON array", () => {
    expect(planFromMetadata("[1,2,3]")).toBe("annual");
  });

  it("falls back when the blob is a bare JSON string", () => {
    expect(planFromMetadata('"semester"')).toBe("annual");
  });

  it("falls back when the blob is JSON null", () => {
    expect(planFromMetadata("null")).toBe("annual");
  });

  it("falls back when plan is a number rather than a word", () => {
    expect(planFromMetadata(JSON.stringify({ plan: 1 }))).toBe("annual");
  });

  it("falls back when plan is nested rather than top level", () => {
    expect(planFromMetadata(JSON.stringify({ meta: { plan: "semester" } }))).toBe(
      "annual",
    );
  });
});

describe("paidForBootcamp — edges", () => {
  it("reads the marker a bootcamp purchase carries", () => {
    expect(paidForBootcamp(JSON.stringify({ bootcamp: "true" }))).toBe(true);
  });

  it("reads an explicit false", () => {
    expect(paidForBootcamp(JSON.stringify({ bootcamp: "false" }))).toBe(false);
  });

  /**
   * Stripe metadata values are always strings, so a real boolean means the
   * blob was written by something other than the payment paths — not a
   * purchase this can honour.
   */
  it("does not accept a boolean true", () => {
    expect(paidForBootcamp(JSON.stringify({ bootcamp: true }))).toBe(false);
  });

  it("does not accept a differently-cased true", () => {
    expect(paidForBootcamp(JSON.stringify({ bootcamp: "TRUE" }))).toBe(false);
  });

  it("is false when the key is absent", () => {
    expect(paidForBootcamp(JSON.stringify({ plan: "annual" }))).toBe(false);
  });

  it("is false on malformed JSON rather than throwing", () => {
    expect(paidForBootcamp("{{{")).toBe(false);
  });

  it("is false on null, undefined and empty", () => {
    expect(paidForBootcamp(null)).toBe(false);
    expect(paidForBootcamp(undefined)).toBe(false);
    expect(paidForBootcamp("")).toBe(false);
  });
});

describe("isBootcampAddOnOnly — edges", () => {
  it("recognises the add-on marker", () => {
    expect(isBootcampAddOnOnly(JSON.stringify({ type: "bootcamp_addon" }))).toBe(
      true,
    );
  });

  it("does not treat a membership payment as an add-on", () => {
    expect(isBootcampAddOnOnly(JSON.stringify({ type: "membership" }))).toBe(
      false,
    );
  });

  it("does not accept a differently-cased marker", () => {
    expect(isBootcampAddOnOnly(JSON.stringify({ type: "BOOTCAMP_ADDON" }))).toBe(
      false,
    );
  });

  it("is false when the type key is absent", () => {
    expect(isBootcampAddOnOnly(JSON.stringify({ bootcamp: "true" }))).toBe(
      false,
    );
  });

  it("is false on malformed JSON, null, undefined and empty", () => {
    expect(isBootcampAddOnOnly("nope")).toBe(false);
    expect(isBootcampAddOnOnly(null)).toBe(false);
    expect(isBootcampAddOnOnly(undefined)).toBe(false);
    expect(isBootcampAddOnOnly("")).toBe(false);
  });
});

describe("currentTerm — boundaries", () => {
  it("calls January spring", () => {
    expect(currentTerm(new Date("2026-01-01T00:00:00-05:00"))).toBe("2026-spring");
  });

  /** The split is the end of May: month index 4 is still spring. */
  it("calls the last day of May spring", () => {
    expect(currentTerm(new Date("2026-05-31T00:00:00-04:00"))).toBe("2026-spring");
  });

  it("calls the first day of June fall", () => {
    expect(currentTerm(new Date("2026-06-01T00:00:00-04:00"))).toBe("2026-fall");
  });

  it("sells the autumn bootcamp over the summer", () => {
    expect(currentTerm(new Date("2026-07-15T00:00:00-04:00"))).toBe("2026-fall");
  });

  it("calls the last day of December fall, not next spring", () => {
    expect(currentTerm(new Date("2026-12-31T00:00:00-05:00"))).toBe("2026-fall");
  });

  it("rolls into the new year's spring on 1 January", () => {
    expect(currentTerm(new Date("2027-01-01T00:00:00-05:00"))).toBe("2027-spring");
  });

  it("handles a leap day", () => {
    expect(currentTerm(new Date("2028-02-29T00:00:00-05:00"))).toBe("2028-spring");
  });

  // 9pm Eastern on May 31 is already June in UTC, where the server runs.
  it("keeps a May 31 evening purchase in spring", () => {
    expect(currentTerm(new Date("2026-05-31T21:00:00-04:00"))).toBe("2026-spring");
  });

  it("keeps a New Year's Eve evening purchase in fall", () => {
    expect(currentTerm(new Date("2026-12-31T21:00:00-05:00"))).toBe("2026-fall");
  });
});

describe("semesterEndDate — boundaries", () => {
  // Atlanta time, whatever the machine's zone: CI runs in UTC.
  const springEnd = (year: number) =>
    new Date(`${year}-05-31T23:59:59.999-04:00`);
  const fallEnd = (year: number) =>
    new Date(`${year}-12-31T23:59:59.999-05:00`);

  it("runs a January date out at the end of May", () => {
    expect(semesterEndDate(new Date("2026-01-15T00:00:00-05:00"))).toEqual(springEnd(2026));
  });

  // The last six hours belong to the next semester: buying then would
  // otherwise buy a few hours.
  it("runs a date just outside the last six hours of spring out at that boundary", () => {
    const outside = new Date("2026-05-31T17:00:00-04:00");
    expect(semesterEndDate(outside)).toEqual(springEnd(2026));
  });

  it("moves a date in the last six hours of spring on to fall", () => {
    const justBefore = new Date("2026-05-31T23:59:59.998-04:00");
    expect(semesterEndDate(justBefore)).toEqual(fallEnd(2026));
  });

  /**
   * Always strictly after the date given, so renewing exactly at the boundary
   * buys the *next* semester rather than the one already paid for.
   */
  it("moves to the end of fall when given the spring boundary exactly", () => {
    expect(semesterEndDate(springEnd(2026))).toEqual(fallEnd(2026));
  });

  it("runs a summer date out at the end of December", () => {
    expect(semesterEndDate(new Date("2026-07-04T00:00:00-04:00"))).toEqual(fallEnd(2026));
  });

  it("moves to next spring when given the fall boundary exactly", () => {
    expect(semesterEndDate(fallEnd(2026))).toEqual(springEnd(2027));
  });

  it("moves a date in the last six hours of fall on to next spring", () => {
    const justBefore = new Date("2026-12-31T23:59:59.998-05:00");
    expect(semesterEndDate(justBefore)).toEqual(springEnd(2027));
  });

  it("never returns a date at or before the one it was given", () => {
    const samples = [
      new Date("2026-01-01T00:00:00-05:00"),
      new Date("2026-05-31T12:00:00-04:00"),
      new Date("2026-06-01T00:00:00-04:00"),
      new Date("2026-12-31T23:59:59.999-05:00"),
      new Date("2028-02-29T00:00:00-05:00"),
    ];

    for (const from of samples) {
      expect(semesterEndDate(from).getTime()).toBeGreaterThan(from.getTime());
    }
  });

  // The server's UTC midnight is 8pm here: a semester used to end then.
  it("ends spring at midnight in Atlanta, not in UTC", () => {
    expect(
      semesterEndDate(new Date("2026-03-01T12:00:00-05:00")).toISOString(),
    ).toBe("2026-06-01T03:59:59.999Z");
  });

  // Memberships written before the boundary was Eastern end on the UTC one.
  // Renewing from there must buy the next semester, not the missing hours.
  it("renews a membership that ended on the old UTC boundary into the next semester", () => {
    expect(semesterEndDate(new Date("2026-05-31T23:59:59.999Z"))).toEqual(
      fallEnd(2026),
    );
    expect(semesterEndDate(new Date("2026-12-31T23:59:59.999Z"))).toEqual(
      springEnd(2027),
    );
  });

  it("lands on a leap year's spring boundary correctly", () => {
    expect(semesterEndDate(new Date("2028-02-29T00:00:00-05:00"))).toEqual(springEnd(2028));
  });
});
