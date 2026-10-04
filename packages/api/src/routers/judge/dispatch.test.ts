import { describe, expect, it } from "vitest";
import {
  JUDGE_HARD_LIMIT_SECONDS,
  JUDGE_SUBMIT_GRACE_SECONDS,
  JUDGE_WALK_LIMIT_SECONDS,
  isLive,
  isPastCutoff,
  pickNext,
  projectMatchesTrack,
} from "./dispatch";
import type { Candidate } from "./dispatch";

const t0 = new Date("2027-02-28T13:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
const first = () => 0;

const c = (id: string, tableNumber: number, coverage = 0, claimedAt: number | null = null): Candidate => ({
  id,
  tableNumber,
  coverage,
  claimedAt,
});

describe("pickNext", () => {
  it("returns nothing when there is nothing left", () => {
    expect(pickNext([], null)).toBeNull();
  });

  it("takes the least-covered project", () => {
    expect(pickNext([c("a", 1, 2), c("b", 2, 0), c("c", 3, 1)], null, first)?.id).toBe("b");
  });

  it("breaks a coverage tie by the table nearest the judge's last one", () => {
    const pick = pickNext([c("far", 90, 1), c("near", 12, 1), c("mid", 40, 1)], 10, first);
    expect(pick?.id).toBe("near");
  });

  it("never trades coverage for distance", () => {
    expect(pickNext([c("next-door", 11, 2), c("across", 200, 1)], 10, first)?.id).toBe("across");
  });

  it("passes over a table someone is at while a free one exists", () => {
    expect(pickNext([c("taken", 1, 0, at(0).getTime()), c("free", 2, 3)], null, first)?.id).toBe("free");
  });

  it("sends the judge to the longest-held table when every one is taken", () => {
    const pick = pickNext(
      [c("recent", 1, 0, at(100).getTime()), c("oldest", 2, 0, at(0).getTime())],
      null,
      first,
    );
    expect(pick?.id).toBe("oldest");
  });

  it("chooses among equals at random", () => {
    const tier = [c("a", 5, 0), c("b", 15, 0)];
    expect(pickNext(tier, 10, () => 0)?.id).toBe("a");
    expect(pickNext(tier, 10, () => 1)?.id).toBe("b");
  });
});

describe("isLive", () => {
  const walking = { startedAt: t0, arrivedAt: null, isCompleted: false };
  const atTable = { startedAt: t0, arrivedAt: at(60), isCompleted: false };

  it("holds a table for the walk limit after hand-out", () => {
    expect(isLive(walking, at(JUDGE_WALK_LIMIT_SECONDS))).toBe(true);
    expect(isLive(walking, at(JUDGE_WALK_LIMIT_SECONDS + 1))).toBe(false);
  });

  it("holds it through the hard limit and grace after arrival", () => {
    const end = 60 + JUDGE_HARD_LIMIT_SECONDS + JUDGE_SUBMIT_GRACE_SECONDS;
    expect(isLive(atTable, at(end))).toBe(true);
    expect(isLive(atTable, at(end + 1))).toBe(false);
  });

  it("measures from arrival, not hand-out, once the judge has tapped in", () => {
    // Past the walk limit from hand-out, still well inside the judging window.
    expect(isLive(atTable, at(JUDGE_WALK_LIMIT_SECONDS + 30))).toBe(true);
  });

  it("is never live once completed, or when never handed out", () => {
    expect(isLive({ ...atTable, isCompleted: true }, at(61))).toBe(false);
    expect(isLive({ startedAt: null, arrivedAt: null, isCompleted: false }, t0)).toBe(false);
  });
});

describe("isPastCutoff", () => {
  it("allows a score at 4:00 and within the grace after it", () => {
    expect(isPastCutoff(t0, at(JUDGE_HARD_LIMIT_SECONDS))).toBe(false);
    expect(isPastCutoff(t0, at(JUDGE_HARD_LIMIT_SECONDS + JUDGE_SUBMIT_GRACE_SECONDS))).toBe(false);
  });

  it("refuses one after the grace", () => {
    expect(isPastCutoff(t0, at(JUDGE_HARD_LIMIT_SECONDS + JUDGE_SUBMIT_GRACE_SECONDS + 1))).toBe(true);
  });
});

describe("projectMatchesTrack", () => {
  const p = { tracks: ["Finance"], challenges: ["Sponsor"], isCreateX: true };
  it("matches every project when the judge has no track", () => {
    expect(projectMatchesTrack(p, null)).toBe(true);
  });
  it("matches by track, challenge and the createX flag", () => {
    expect(projectMatchesTrack(p, "Finance")).toBe(true);
    expect(projectMatchesTrack(p, "Sponsor")).toBe(true);
    expect(projectMatchesTrack(p, "createX")).toBe(true);
    expect(projectMatchesTrack(p, "Health")).toBe(false);
  });
});
