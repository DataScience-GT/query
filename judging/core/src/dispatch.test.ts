import { describe, expect, it } from "vitest";
import { pickNext } from "./dispatch";
import type { Candidate, DispatchConfig } from "./dispatch";

const t0 = new Date("2027-02-28T13:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
const first = () => 0;
const coverage: DispatchConfig = {
  strategy: "coverage",
  minLooksPerProject: 1,
};

const c = (
  id: string,
  tableNumber: number,
  looks = 0,
  claimedAt: number | null = null,
  extra: Partial<Candidate> = {},
): Candidate => ({
  id,
  tableNumber,
  coverage: looks,
  claimedAt,
  ...extra,
});

describe("pickNext coverage", () => {
  it("returns nothing when there is nothing left", () => {
    expect(pickNext([], { lastTable: null }, coverage, first)).toBeNull();
  });

  it("takes the least-covered project", () => {
    expect(
      pickNext(
        [c("a", 1, 2), c("b", 2, 0), c("c", 3, 1)],
        { lastTable: null },
        coverage,
        first,
      )?.id,
    ).toBe("b");
  });

  it("breaks a coverage tie by the table nearest the judge's last one", () => {
    const pick = pickNext(
      [c("far", 90, 1), c("near", 12, 1), c("mid", 40, 1)],
      { lastTable: 10 },
      coverage,
      first,
    );
    expect(pick?.id).toBe("near");
  });

  it("never trades coverage for distance", () => {
    expect(
      pickNext(
        [c("next-door", 11, 2), c("across", 200, 1)],
        { lastTable: 10 },
        coverage,
        first,
      )?.id,
    ).toBe("across");
  });

  it("passes over a table someone is at while a free one exists", () => {
    expect(
      pickNext(
        [c("taken", 1, 0, at(0).getTime()), c("free", 2, 3)],
        { lastTable: null },
        coverage,
        first,
      )?.id,
    ).toBe("free");
  });

  it("sends the judge to the longest-held table when every one is taken", () => {
    const pick = pickNext(
      [
        c("recent", 1, 0, at(100).getTime()),
        c("oldest", 2, 0, at(0).getTime()),
      ],
      { lastTable: null },
      coverage,
      first,
    );
    expect(pick?.id).toBe("oldest");
  });

  it("chooses among equals at random", () => {
    const tier = [c("a", 5, 0), c("b", 15, 0)];
    expect(pickNext(tier, { lastTable: 10 }, coverage, () => 0)?.id).toBe("a");
    expect(pickNext(tier, { lastTable: 10 }, coverage, () => 1)?.id).toBe("b");
  });

  it("prefers the same zone over a closer table number in another zone", () => {
    const pick = pickNext(
      [
        c("other-room", 2, 0, null, { zoneId: "atrium" }),
        c("same-room", 30, 0, null, { zoneId: "hall" }),
      ],
      { lastTable: 4, zoneId: "hall" },
      coverage,
      first,
    );
    expect(pick?.id).toBe("same-room");
  });
});

describe("pickNext uncertainty", () => {
  const uncertainty: DispatchConfig = {
    strategy: "uncertainty",
    minLooksPerProject: 2,
  };

  it("keeps covering while any project is under the minimum", () => {
    const pick = pickNext(
      [
        c("thin", 1, 0, null, { uncertainty: 0 }),
        c("shaky", 2, 5, null, { uncertainty: 9 }),
      ],
      { lastTable: null },
      uncertainty,
      first,
    );
    expect(pick?.id).toBe("thin");
  });

  it("takes the least settled project once coverage is met", () => {
    const pick = pickNext(
      [
        c("settled", 1, 2, null, { uncertainty: 0.1 }),
        c("open", 9, 2, null, { uncertainty: 4 }),
      ],
      { lastTable: 1 },
      uncertainty,
      first,
    );
    expect(pick?.id).toBe("open");
  });
});
