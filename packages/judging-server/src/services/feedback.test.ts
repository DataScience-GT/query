import { describe, expect, it } from "vitest";
import { feedbackStatus, median } from "./feedback";

describe("feedbackStatus", () => {
  it("refuses before publish and for the wrong token", () => {
    expect(feedbackStatus({ published: false, tokenMatches: true })).toBe("forbidden");
    expect(feedbackStatus({ published: true, tokenMatches: false })).toBe("forbidden");
  });

  it("allows the project's token after publish", () => {
    expect(feedbackStatus({ published: true, tokenMatches: true })).toBe("ok");
  });

  it("puts the event median between the middle scores", () => {
    expect(median([1, 3, 9])).toBe(3);
    expect(median([1, 2, 8, 9])).toBe(5);
  });
});
