import { describe, expect, it } from "vitest";
import {
  countdown,
  countdownTone,
  formatScore,
  linkHost,
  nextPresentation,
  roomPlace,
  startsIn,
} from "./desk";

describe("countdown", () => {
  it("shows minutes and two-digit seconds", () => {
    expect(countdown(245)).toBe("4:05");
    expect(countdown(60)).toBe("1:00");
    expect(countdown(9)).toBe("0:09");
  });

  it("stops at zero", () => {
    expect(countdown(0)).toBe("0:00");
    expect(countdown(-12)).toBe("0:00");
  });
});

describe("countdownTone", () => {
  it("warns under three minutes and alarms under ninety seconds", () => {
    expect(countdownTone(181)).toBe("neutral");
    expect(countdownTone(180)).toBe("neutral");
    expect(countdownTone(179)).toBe("warning");
    expect(countdownTone(90)).toBe("warning");
    expect(countdownTone(89)).toBe("danger");
    expect(countdownTone(0)).toBe("danger");
  });
});

describe("startsIn", () => {
  it("rounds up to whole minutes, never below one", () => {
    expect(startsIn(5_000)).toBe("in 1 min");
    expect(startsIn(4 * 60_000 + 1)).toBe("in 5 min");
    expect(startsIn(0)).toBe("in 1 min");
  });

  it("switches to hours past an hour", () => {
    expect(startsIn(65 * 60_000)).toBe("in 1 h 5 min");
    expect(startsIn(120 * 60_000)).toBe("in 2 h 0 min");
  });
});

describe("formatScore", () => {
  it("prints two places, or says there is none", () => {
    expect(formatScore(3.456)).toBe("3.46");
    expect(formatScore(4)).toBe("4.00");
    expect(formatScore(null)).toBe("None yet");
  });
});

describe("roomPlace", () => {
  it("adds the building when there is one", () => {
    expect(roomPlace("1116", "Klaus")).toBe("1116 · Klaus");
    expect(roomPlace("Atrium", null)).toBe("Atrium");
  });
});

describe("linkHost", () => {
  it("labels a link by its host", () => {
    expect(linkHost("https://www.github.com/team/app")).toBe("github.com");
    expect(linkHost("https://devpost.com/software/x")).toBe("devpost.com");
  });

  it("falls back to the text for something that is not a URL", () => {
    expect(linkHost("not a link")).toBe("not a link");
  });
});

describe("nextPresentation", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 14, minute));
  const slot = (start: number) => ({
    startsAt: at(start),
    endsAt: at(start + 10),
  });
  const now = at(15).getTime();

  it("picks the presentation running now over a later one", () => {
    const running = { id: "a", presentation: slot(10), myEvaluation: null };
    const later = { id: "b", presentation: slot(20), myEvaluation: null };
    expect(nextPresentation([later, running], now)?.id).toBe("a");
  });

  it("skips finished, judged and unscheduled projects", () => {
    const finished = { id: "a", presentation: slot(0), myEvaluation: null };
    const judged = {
      id: "b",
      presentation: slot(10),
      myEvaluation: { revision: 1 },
    };
    const unscheduled = { id: "c", presentation: null, myEvaluation: null };
    const upcoming = { id: "d", presentation: slot(30), myEvaluation: null };
    expect(
      nextPresentation([finished, judged, unscheduled, upcoming], now)?.id,
    ).toBe("d");
  });

  it("is null when nothing is left", () => {
    const finished = { id: "a", presentation: slot(0), myEvaluation: null };
    expect(nextPresentation([finished], now)).toBeNull();
    expect(nextPresentation([], now)).toBeNull();
  });
});
