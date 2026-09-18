import { describe, expect, it } from "vitest";
import { canDownloadBootcampFile } from "./bootcamp-route-rules";

const FALL = "2026-fall";
const member = { isStaff: false, bootcampTerm: FALL };
const staff = { isStaff: true, bootcampTerm: null };

describe("bootcamp download authorization", () => {
  it("hides drafts from a member but allows staff to inspect them", () => {
    const draft = { term: FALL, isPublished: false };
    expect(canDownloadBootcampFile(member, draft, true)).toBe(false);
    expect(canDownloadBootcampFile(staff, draft, true)).toBe(true);
  });

  it("hides another cohort's material from a member", () => {
    expect(
      canDownloadBootcampFile(
        member,
        { term: "2026-spring", isPublished: true },
        true,
      ),
    ).toBe(false);
  });

  it("keeps a member's own cohort reachable after the term rolls", () => {
    // Nothing here reads the clock: January is the same answer as October.
    expect(
      canDownloadBootcampFile(member, { term: FALL, isPublished: true }, true),
    ).toBe(true);
  });

  it("never matches a member who bought no bootcamp", () => {
    expect(
      canDownloadBootcampFile(
        { isStaff: false, bootcampTerm: null },
        { term: FALL, isPublished: true },
        true,
      ),
    ).toBe(false);
  });

  it("requires metadata even for staff", () => {
    expect(
      canDownloadBootcampFile(staff, { term: FALL, isPublished: true }, false),
    ).toBe(false);
  });
});
