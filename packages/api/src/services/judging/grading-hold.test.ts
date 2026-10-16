import { describe, expect, it } from "vitest";
import {
  GRADING_HOLD_MS,
  gradingLockKey,
  gradingRefusal,
  gradingStateOf,
  gradingStates,
  holdsGrade,
} from "./grading-hold";

const NOW = new Date("2026-04-18T15:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

const draft = (
  judgeId: string,
  over: { updatedAt?: Date; deadlineAt?: Date | null } = {},
) => ({
  judgeId,
  updatedAt: over.updatedAt ?? NOW,
  deadlineAt: over.deadlineAt ?? null,
});

describe("GRADING_HOLD_MS", () => {
  it("is ten minutes", () => {
    expect(GRADING_HOLD_MS).toBe(10 * 60 * 1000);
  });
});

describe("holdsGrade", () => {
  it("holds a project while its draft was saved inside the hold", () => {
    expect(holdsGrade(draft("a"), NOW)).toBe(true);
    expect(
      holdsGrade(
        { updatedAt: ago(GRADING_HOLD_MS - 1), deadlineAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("lets go once the draft has sat for the whole hold", () => {
    expect(
      holdsGrade({ updatedAt: ago(GRADING_HOLD_MS), deadlineAt: null }, NOW),
    ).toBe(false);
    expect(
      holdsGrade(
        { updatedAt: ago(GRADING_HOLD_MS * 3), deadlineAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("holds a stale draft until its presentation's deadline", () => {
    const stale = ago(GRADING_HOLD_MS * 3);
    expect(holdsGrade({ updatedAt: stale, deadlineAt: ahead(1000) }, NOW)).toBe(
      true,
    );
    expect(holdsGrade({ updatedAt: stale, deadlineAt: ago(1) }, NOW)).toBe(
      false,
    );
    expect(holdsGrade({ updatedAt: stale, deadlineAt: NOW }, NOW)).toBe(false);
  });
});

describe("gradingStateOf", () => {
  it("is open when nobody has the project", () => {
    expect(gradingStateOf("me", [], [], NOW)).toBe("open");
  });

  it("is mine for a judge's own evaluation", () => {
    expect(gradingStateOf("me", [{ judgeId: "me" }], [], NOW)).toBe("mine");
  });

  it("is graded once another judge has submitted", () => {
    expect(gradingStateOf("me", [{ judgeId: "them" }], [], NOW)).toBe("graded");
  });

  it("keeps a project mine when old duplicates exist", () => {
    expect(
      gradingStateOf("me", [{ judgeId: "them" }, { judgeId: "me" }], [], NOW),
    ).toBe("mine");
  });

  it("is graded even if the judge has a draft of their own", () => {
    expect(
      gradingStateOf("me", [{ judgeId: "them" }], [draft("me")], NOW),
    ).toBe("graded");
  });

  it("is mine while the judge holds it with a draft", () => {
    expect(gradingStateOf("me", [], [draft("me")], NOW)).toBe("mine");
  });

  it("is in progress while another judge holds it", () => {
    expect(gradingStateOf("me", [], [draft("them")], NOW)).toBe("in_progress");
    expect(
      gradingStateOf(
        "me",
        [],
        [
          draft("them", {
            updatedAt: ago(GRADING_HOLD_MS * 2),
            deadlineAt: ahead(60_000),
          }),
        ],
        NOW,
      ),
    ).toBe("in_progress");
  });

  it("is open past another judge's stale draft", () => {
    expect(
      gradingStateOf(
        "me",
        [],
        [draft("them", { updatedAt: ago(GRADING_HOLD_MS + 1) })],
        NOW,
      ),
    ).toBe("open");
  });

  it("is open past the judge's own stale draft", () => {
    expect(
      gradingStateOf(
        "me",
        [],
        [draft("me", { updatedAt: ago(GRADING_HOLD_MS + 1) })],
        NOW,
      ),
    ).toBe("open");
  });

  it("hands the hold to whoever started last", () => {
    const old = draft("them", { updatedAt: ago(GRADING_HOLD_MS + 1) });
    const fresh = draft("me");
    expect(gradingStateOf("me", [], [old, fresh], NOW)).toBe("mine");
    expect(gradingStateOf("them", [], [old, fresh], NOW)).toBe("in_progress");
  });

  describe("reserved for the judge assigned to it", () => {
    const until = ahead(3 * 60_000);

    it("is reserved while a free project is kept back", () => {
      expect(gradingStateOf("me", [], [], NOW, until)).toBe("reserved");
    });

    it("is open once nothing is kept back", () => {
      expect(gradingStateOf("me", [], [], NOW, null)).toBe("open");
    });

    it("is reserved past another judge's stale draft", () => {
      expect(
        gradingStateOf(
          "me",
          [],
          [draft("them", { updatedAt: ago(GRADING_HOLD_MS + 1) })],
          NOW,
          until,
        ),
      ).toBe("reserved");
    });

    it("gives way to the assigned judge's draft: in progress, not reserved", () => {
      expect(gradingStateOf("me", [], [draft("them")], NOW, until)).toBe(
        "in_progress",
      );
    });

    it("gives way to a grade, and to the judge's own work", () => {
      expect(gradingStateOf("me", [{ judgeId: "them" }], [], NOW, until)).toBe(
        "graded",
      );
      expect(gradingStateOf("me", [{ judgeId: "me" }], [], NOW, until)).toBe(
        "mine",
      );
      expect(gradingStateOf("me", [], [draft("me")], NOW, until)).toBe("mine");
    });
  });
});

describe("gradingStates", () => {
  it("reads each project from its own rows", () => {
    const states = gradingStates(
      "me",
      ["mine", "theirs", "held", "free"],
      [
        { entryId: "mine", judgeId: "me" },
        { entryId: "theirs", judgeId: "them" },
      ],
      [{ entryId: "held", ...draft("them") }],
      NOW,
    );
    expect(Object.fromEntries(states)).toEqual({
      mine: "mine",
      theirs: "graded",
      held: "in_progress",
      free: "open",
    });
  });

  it("marks the projects kept back for another judge", () => {
    const until = ahead(60_000);
    const states = gradingStates(
      "me",
      ["kept", "kept-but-held", "free"],
      [],
      [{ entryId: "kept-but-held", ...draft("them") }],
      NOW,
      new Map([
        ["kept", until],
        ["kept-but-held", until],
      ]),
    );
    expect(Object.fromEntries(states)).toEqual({
      kept: "reserved",
      "kept-but-held": "in_progress",
      free: "open",
    });
  });

  it("ignores rows for projects it was not asked about", () => {
    const states = gradingStates(
      "me",
      ["a"],
      [{ entryId: "b", judgeId: "them" }],
      [],
      NOW,
    );
    expect([...states.keys()]).toEqual(["a"]);
    expect(states.get("a")).toBe("open");
  });
});

describe("gradingRefusal", () => {
  it("names the challenge when another judge graded the project", () => {
    expect(gradingRefusal("graded", "Best Use of AI")).toBe(
      "Another judge has already graded this project for Best Use of AI. Each project is graded once.",
    );
  });

  it("asks the judge to pick another while one is grading", () => {
    expect(gradingRefusal("in_progress", "General")).toBe(
      "Another judge is grading this project right now. Pick another one.",
    );
  });

  it("lets a judge write to a project that is theirs or open", () => {
    expect(gradingRefusal("mine", "General")).toBeNull();
    expect(gradingRefusal("open", "General")).toBeNull();
  });

  it("leaves a reserved project to the timing rules, which say when it opens", () => {
    expect(gradingRefusal("reserved", "General")).toBeNull();
  });
});

describe("gradingLockKey", () => {
  it("is the same for the same pair and differs for another", () => {
    expect(gradingLockKey("e1", "c1")).toBe(gradingLockKey("e1", "c1"));
    expect(gradingLockKey("e1", "c1")).not.toBe(gradingLockKey("e1", "c2"));
    expect(gradingLockKey("e1", "c1")).not.toBe(gradingLockKey("e2", "c1"));
    expect(gradingLockKey("e1", "c2")).not.toBe(gradingLockKey("e2", "c1"));
  });
});
