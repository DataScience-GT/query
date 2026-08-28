import { describe, it, expect } from "vitest";
import { judgingPrepIsCurrent } from "./judging-prep";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("judgingPrepIsCurrent", () => {
  it("accepts a result for the edition and run that started it", () => {
    expect(judgingPrepIsCurrent(A, 3, A, 3)).toBe(true);
  });

  it("drops a result after the organiser switches editions", () => {
    expect(judgingPrepIsCurrent(A, 3, B, 4)).toBe(false);
    expect(judgingPrepIsCurrent(A, 3, B, 3)).toBe(false);
  });

  it("drops a result after a newer prepare or rebuild on the same edition", () => {
    expect(judgingPrepIsCurrent(A, 3, A, 4)).toBe(false);
  });
});
