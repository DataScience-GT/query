import { describe, expect, it } from "vitest";
import { DEADLINE_GRACE_MS, takeoverAt } from "../timing";
import { judgeProgress, judgeProgressById } from "./judge-progress";

const at = (time: string) => new Date(`2027-02-08T${time}:00Z`);
const startsAt = at("15:00");
const deadlineAt = at("15:20");
const JUDGE = "ada";
const OTHER = "bea";

const input = (over: Partial<Parameters<typeof judgeProgress>[0]> = {}) => ({
  startsAt,
  deadlineAt,
  assignedJudgeId: JUDGE,
  evaluations: [],
  drafts: [],
  ...over,
});
// The desk stamps a presentation's draft with its deadline.
const draft = (
  judgeId: string,
  time = "15:02",
  draftDeadline: Date | null = deadlineAt,
) => ({
  judgeId,
  updatedAt: at(time),
  deadlineAt: draftDeadline,
});

describe("judgeProgress", () => {
  it("says nothing without an assigned judge", () => {
    expect(
      judgeProgress(
        input({ assignedJudgeId: null, evaluations: [{ judgeId: OTHER }] }),
        at("16:00"),
      ),
    ).toBeNull();
  });

  it("says nothing before the presentation starts", () => {
    expect(judgeProgress(input(), at("14:59"))).toBeNull();
    // A judge cannot have begun, so nothing could show anyway.
    expect(
      judgeProgress(input({ drafts: [draft(JUDGE)] }), at("14:59")),
    ).toBeNull();
  });

  it("says nothing while the assigned judge still has the presentation to themselves", () => {
    expect(judgeProgress(input(), at("15:00"))).toBeNull();
    expect(judgeProgress(input(), at("15:04"))).toBeNull();
  });

  it("flags an assigned judge who has not begun once the takeover time passes", () => {
    // The time the judge desk opens the presentation to everyone else.
    const opens = takeoverAt(startsAt);
    expect(judgeProgress(input(), new Date(opens.getTime() - 1))).toBeNull();
    expect(judgeProgress(input(), opens)).toBe("not_started");
    expect(judgeProgress(input(), at("15:05"))).toBe("not_started");
    // And stays so once the slot is over.
    expect(judgeProgress(input(), at("18:00"))).toBe("not_started");
  });

  it("is grading while the assigned judge has a draft open", () => {
    expect(judgeProgress(input({ drafts: [draft(JUDGE)] }), at("15:01"))).toBe(
      "grading",
    );
    // Past the takeover time too: they began, so nothing was missed.
    expect(judgeProgress(input({ drafts: [draft(JUDGE)] }), at("15:30"))).toBe(
      "grading",
    );
  });

  it("is graded once the assigned judge has submitted", () => {
    expect(
      judgeProgress(input({ evaluations: [{ judgeId: JUDGE }] }), at("15:08")),
    ).toBe("graded");
    // An evaluation outranks a draft left beside it.
    expect(
      judgeProgress(
        input({ evaluations: [{ judgeId: JUDGE }], drafts: [draft(JUDGE)] }),
        at("15:08"),
      ),
    ).toBe("graded");
  });

  it("is taken over when another judge has submitted or has a draft", () => {
    expect(
      judgeProgress(input({ evaluations: [{ judgeId: OTHER }] }), at("15:09")),
    ).toBe("taken_over");
    expect(judgeProgress(input({ drafts: [draft(OTHER)] }), at("15:09"))).toBe(
      "taken_over",
    );
  });

  it("reads the judge who saved a draft last as the one who has it", () => {
    // Ada's draft was left alone and Bea took over; both rows remain.
    expect(
      judgeProgress(
        input({ drafts: [draft(JUDGE, "15:01"), draft(OTHER, "15:12")] }),
        at("15:13"),
      ),
    ).toBe("taken_over");
    // Or Ada came back and saved after Bea.
    expect(
      judgeProgress(
        input({ drafts: [draft(OTHER, "15:12"), draft(JUDGE, "15:20")] }),
        at("15:21"),
      ),
    ).toBe("grading");
  });

  it("stops counting a draft that lost its deadline once judging for the presentation is over", () => {
    // The deadline and the grace a last write gets.
    const over = new Date(deadlineAt.getTime() + DEADLINE_GRACE_MS);
    const before = new Date(over.getTime() - 1);
    // Opened and left empty: it is kept without its deadline and never
    // submitted.
    const empty = input({ drafts: [draft(JUDGE, "15:02", null)] });
    expect(judgeProgress(empty, before)).toBe("grading");
    expect(judgeProgress(empty, over)).toBe("not_started");
    // Another judge's, likewise: nobody took it over.
    expect(
      judgeProgress(input({ drafts: [draft(OTHER, "15:12", null)] }), over),
    ).toBe("not_started");
    // One still carrying its deadline is about to be submitted for its judge.
    expect(judgeProgress(input({ drafts: [draft(JUDGE)] }), over)).toBe(
      "grading",
    );
    expect(
      judgeProgress(input({ drafts: [draft(OTHER, "15:12")] }), over),
    ).toBe("taken_over");
  });
});

describe("judgeProgressById", () => {
  const roots: Record<string, string> = {
    general: "general",
    "general-ai": "general",
    acme: "acme",
  };
  const rootIdOf = (id: string) => roots[id] ?? null;
  const appointment = (over: Record<string, unknown> = {}) => ({
    id: "apt",
    entryId: "e1",
    challengeId: "general",
    startsAt,
    deadlineAt,
    assignedJudgeId: JUDGE,
    ...over,
  });
  const row = (over: Record<string, unknown> = {}) => ({
    judgeId: JUDGE,
    entryId: "e1",
    challengeId: "general",
    appointmentId: null as string | null,
    ...over,
  });
  const run = (
    appointments: ReturnType<typeof appointment>[],
    evaluations: ReturnType<typeof row>[],
    drafts: (ReturnType<typeof row> & {
      updatedAt: Date;
      deadlineAt: Date | null;
    })[],
    now = at("15:30"),
  ) => judgeProgressById(appointments, evaluations, drafts, rootIdOf, now);

  it("matches by appointment, or by project and challenge root when none is named", () => {
    const progress = run(
      [appointment()],
      [
        // Another judge's, on a challenge under the appointment's root.
        row({ judgeId: OTHER, challengeId: "general-ai" }),
      ],
      [],
    );
    expect(progress.get("apt")).toBe("taken_over");

    // Written against another appointment, another project, another root.
    const unrelated = run(
      [appointment()],
      [
        row({ appointmentId: "other" }),
        row({ entryId: "e2" }),
        row({ challengeId: "acme" }),
      ],
      [],
    );
    expect(unrelated.get("apt")).toBe("not_started");

    const named = run(
      [appointment()],
      [row({ appointmentId: "apt", challengeId: "acme" })],
      [],
    );
    expect(named.get("apt")).toBe("graded");
  });

  it("reads each appointment on its own rows, and leaves out the ones with nothing to say", () => {
    const progress = run(
      [
        appointment({ id: "a1", entryId: "e1" }),
        appointment({ id: "a2", entryId: "e2", assignedJudgeId: OTHER }),
        appointment({ id: "a3", entryId: "e3", assignedJudgeId: null }),
        appointment({ id: "a4", entryId: "e4", startsAt: at("16:00") }),
      ],
      [row({ entryId: "e1" })],
      [
        {
          ...row({ entryId: "e2", judgeId: OTHER }),
          updatedAt: at("15:10"),
          deadlineAt,
        },
      ],
    );
    expect(Object.fromEntries(progress)).toEqual({
      a1: "graded",
      a2: "grading",
    });
  });
});
