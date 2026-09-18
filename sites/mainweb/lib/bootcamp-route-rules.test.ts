import { describe, expect, it } from "vitest";
import { canDownloadBootcampFile } from "./bootcamp-route-rules";

const CURRENT = "2026-fall";
const member = { isStaff: false, isEnrolled: true };

describe("bootcamp download authorization", () => {
  it("hides drafts from a member but allows staff to inspect them", () => {
    const draft = { term: CURRENT, isPublished: false };
    expect(canDownloadBootcampFile(member, draft, CURRENT, true)).toBe(false);
    expect(
      canDownloadBootcampFile(
        { isStaff: true, isEnrolled: false },
        draft,
        CURRENT,
        true,
      ),
    ).toBe(true);
  });

  it("hides wrong-term material from an enrolled member", () => {
    expect(
      canDownloadBootcampFile(
        member,
        { term: "2026-spring", isPublished: true },
        CURRENT,
        true,
      ),
    ).toBe(false);
  });

  it("requires metadata even for staff", () => {
    expect(
      canDownloadBootcampFile(
        { isStaff: true, isEnrolled: false },
        { term: CURRENT, isPublished: true },
        CURRENT,
        false,
      ),
    ).toBe(false);
  });

  it("allows a published current-term file to an enrolled member", () => {
    expect(
      canDownloadBootcampFile(
        member,
        { term: CURRENT, isPublished: true },
        CURRENT,
        true,
      ),
    ).toBe(true);
  });
});
