import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  judgingAppointments,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingSchedules,
} from "@query/db";
import { QUEUE_REFUSAL, assertQueueOffers, loadQueue } from "./queue-store";
import { QUEUE_WINDOW, queueOrder, queueWindow } from "./queue";
import type { ChallengeRow, Seat } from "./evaluation-store";
import { GRADING_HOLD_MS } from "./grading-hold";

const HACK = "hackathon";
const JUDGE = "judge-1";

const row = (id: string, over: Partial<ChallengeRow> = {}): ChallengeRow => ({
  id,
  parentId: null,
  mode: "unscheduled",
  label: id,
  isGeneral: false,
  isGroup: false,
  ...over,
});
const general = row("general", { isGeneral: true });
const sponsor = row("sponsor", { mode: "scheduled" });
const mlh = row("mlh", { isGroup: true });
const mongo = row("mongo", { parentId: "mlh" });
const challenges = [general, sponsor, mlh, mongo];

const seat = (challengeId: string): Seat => ({
  roomId: "room-1",
  roomName: "Table 4",
  challengeId,
});

const entryIds = Array.from({ length: 8 }, (_, i) => `entry-${i}`);

const name = (table: unknown) => getTableName(table as never);
const via = (...tables: unknown[]) => tables.map(name).join(">");
const entries = via(judgingEntries, judgingEntryChallenges);
const evaluations = via(judgingEvaluations);
const drafts = via(judgingEvaluationDrafts);
const schedules = via(judgingSchedules);
const appointments = via(judgingAppointments);
const memberships = via(judgingEntryChallenges);

type Rows = unknown[] | ((call: number) => unknown[]);
type Read = { table: string; where?: SQL; on?: SQL };

/** A database whose selects answer by the tables they read, in order. */
function fakeDb(answers: Record<string, Rows>) {
  const reads: Read[] = [];
  const counts = new Map<string, number>();
  const select = () => {
    const joined: unknown[] = [];
    let from: unknown;
    let where: SQL | undefined;
    let on: SQL | undefined;
    const chain: Record<string, unknown> = {
      from: (table: unknown) => {
        from = table;
        return chain;
      },
      where: (clause: SQL) => {
        where = clause;
        return chain;
      },
      then: (
        ok: (rows: unknown[]) => unknown,
        fail: (e: unknown) => unknown,
      ) => {
        const key = via(from, ...joined);
        reads.push({ table: key, where, on });
        const call = counts.get(key) ?? 0;
        counts.set(key, call + 1);
        const answer = answers[key] ?? [];
        return Promise.resolve(
          typeof answer === "function" ? answer(call) : answer,
        ).then(ok, fail);
      },
    };
    for (const join of ["innerJoin", "leftJoin"]) {
      chain[join] = (table: unknown, clause: SQL) => {
        joined.push(table);
        on = clause;
        return chain;
      };
    }
    for (const method of ["orderBy", "limit", "for"]) {
      chain[method] = () => chain;
    }
    return chain;
  };
  return { db: { select } as never, reads };
}

const ids = (list: readonly string[]) => list.map((id) => ({ id }));
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const minutesAhead = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000);

const input = (
  over: Partial<Parameters<typeof loadQueue>[1]> = {},
): Parameters<typeof loadQueue>[1] => ({
  hackathonId: HACK,
  judgeId: JUDGE,
  challenge: general,
  seat: null,
  ...over,
});

describe("loadQueue", () => {
  it("says where each project stands for the judge", async () => {
    const { db } = fakeDb({
      [entries]: ids(entryIds.slice(0, 5)),
      [evaluations]: [
        { entryId: "entry-0", judgeId: JUDGE },
        { entryId: "entry-1", judgeId: "other" },
      ],
      [drafts]: [
        {
          entryId: "entry-2",
          judgeId: "other",
          updatedAt: minutesAgo(1),
          deadlineAt: null,
        },
        {
          entryId: "entry-3",
          judgeId: "other",
          updatedAt: minutesAgo(60),
          deadlineAt: null,
        },
      ],
    });

    const queue = await loadQueue(db, input());

    expect(queue.timed).toBe(false);
    expect(queue.needsRoom).toBe(false);
    expect(
      Object.fromEntries(queue.candidates.map((c) => [c.entryId, c.grading])),
    ).toEqual({
      "entry-0": "mine",
      "entry-1": "graded",
      "entry-2": "in_progress",
      "entry-3": "open",
      "entry-4": "open",
    });
  });

  it("keeps a project the judge only opened on offer to them", async () => {
    const mine = (entryId: string, revision: number) => ({
      entryId,
      judgeId: JUDGE,
      updatedAt: minutesAgo(1),
      deadlineAt: null,
      revision,
    });
    const { db } = fakeDb({
      [entries]: ids(entryIds.slice(0, 4)),
      [evaluations]: [
        { entryId: "entry-2", judgeId: "other" },
        { entryId: "entry-3", judgeId: JUDGE },
      ],
      [drafts]: [
        mine("entry-0", 0),
        mine("entry-1", 2),
        mine("entry-2", 0),
        mine("entry-3", 0),
      ],
    });

    const queue = await loadQueue(db, input());

    expect(
      Object.fromEntries(queue.candidates.map((c) => [c.entryId, c.grading])),
    ).toEqual({
      // Opened, nothing saved: still on offer.
      "entry-0": "open",
      // Saved to: the judge is grading it.
      "entry-1": "mine",
      // Another judge's grade, or the judge's own, wins over an empty draft.
      "entry-2": "graded",
      "entry-3": "mine",
    });
  });

  it("has no candidates, and reads no grades, for a challenge without projects", async () => {
    const { db, reads } = fakeDb({});

    const queue = await loadQueue(db, input());

    expect(queue.candidates).toEqual([]);
    expect(reads.map((r) => r.table)).toEqual([schedules, entries]);
  });

  it("narrows the projects to a prize when asked", async () => {
    const { db, reads } = fakeDb({ [entries]: ids(["entry-0"]) });

    await loadQueue(db, input({ challenge: mlh, filterId: "mongo" }));

    const params = new PgDialect().sqlToQuery(
      reads.find((r) => r.table === entries)?.on as SQL,
    ).params;
    expect(params).toContain("mongo");
  });

  describe("at a scheduled challenge under a saved schedule", () => {
    const world = (over: Record<string, Rows> = {}) => ({
      [schedules]: [{ id: "schedule" }],
      [entries]: ids(["entry-0", "entry-1", "entry-2"]),
      ...over,
    });

    it("is timed, and asks a judge seated elsewhere to join the room", async () => {
      const { db, reads } = fakeDb(world());

      const queue = await loadQueue(db, input({ challenge: sponsor }));
      expect(queue).toEqual({ timed: true, needsRoom: true, candidates: [] });

      const elsewhere = await loadQueue(
        db,
        input({ challenge: sponsor, seat: seat("general") }),
      );
      expect(elsewhere.needsRoom).toBe(true);
      expect(reads.some((r) => r.table === entries)).toBe(false);
    });

    it("offers only the presentations running now in the judge's room", async () => {
      const slot = (entryId: string, startsAt: Date, deadlineAt: Date) => ({
        id: `slot-${entryId}`,
        entryId,
        startsAt,
        deadlineAt,
      });
      const { db } = fakeDb(
        world({
          [appointments]: [
            slot("entry-0", minutesAgo(30), minutesAgo(20)),
            slot("entry-1", minutesAgo(5), minutesAhead(5)),
            slot("entry-2", minutesAhead(20), minutesAhead(30)),
          ],
        }),
      );

      const queue = await loadQueue(
        db,
        input({ challenge: sponsor, seat: seat("sponsor") }),
      );

      expect(queue.timed).toBe(true);
      expect(queue.needsRoom).toBe(false);
      expect(queue.candidates.map((c) => c.entryId)).toEqual(["entry-1"]);
    });

    describe("with a judge assigned to each presentation", () => {
      const running = (entryId: string, assignedJudgeId: string | null) => ({
        id: `slot-${entryId}`,
        entryId,
        startsAt: minutesAgo(2),
        deadlineAt: minutesAhead(8),
        assignedJudgeId,
      });
      const here = input({ challenge: sponsor, seat: seat("sponsor") });

      it("leaves out a presentation still reserved for another judge", async () => {
        const { db } = fakeDb(
          world({
            [appointments]: [
              running("entry-0", "other"),
              running("entry-1", JUDGE),
              running("entry-2", null),
            ],
          }),
        );

        const queue = await loadQueue(db, here);

        expect(queue.candidates.map((c) => c.entryId)).toEqual([
          "entry-1",
          "entry-2",
        ]);
      });

      it("says which presentations are the judge's own", async () => {
        const { db } = fakeDb(
          world({
            [appointments]: [
              running("entry-0", "other"),
              running("entry-1", JUDGE),
              running("entry-2", null),
            ],
          }),
        );

        const queue = await loadQueue(db, here);

        expect(
          Object.fromEntries(
            queue.candidates.map((c) => [c.entryId, c.assigned ?? false]),
          ),
        ).toEqual({ "entry-1": true, "entry-2": false });
      });

      it("opens a presentation to the judge once its takeover time has passed", async () => {
        const late = (entryId: string) => ({
          ...running(entryId, "other"),
          startsAt: minutesAgo(6),
          deadlineAt: minutesAhead(4),
        });
        const { db } = fakeDb(
          world({
            [appointments]: [late("entry-0"), running("entry-1", "other")],
          }),
        );

        const queue = await loadQueue(db, here);

        expect(queue.candidates.map((c) => c.entryId)).toEqual(["entry-0"]);
        // Open for takeover, not the judge's own.
        expect(queue.candidates[0].assigned).toBeUndefined();
      });

      it("offers the judge's own presentation before the ones open to everyone", async () => {
        const { db } = fakeDb(
          world({
            [appointments]: [
              running("entry-0", null),
              running("entry-1", null),
              running("entry-2", JUDGE),
            ],
          }),
        );

        const queue = await loadQueue(db, here);

        expect(
          queueWindow(JUDGE, "sponsor", queue.candidates, Infinity)[0],
        ).toBe("entry-2");
      });

      it("still keeps a presentation another judge holds off the judge", async () => {
        const { db } = fakeDb(
          world({
            [appointments]: [
              { ...running("entry-0", "other"), startsAt: minutesAgo(6) },
            ],
            [drafts]: [
              {
                entryId: "entry-0",
                judgeId: "other",
                updatedAt: minutesAgo(1),
                deadlineAt: minutesAhead(4),
                revision: 1,
              },
            ],
          }),
        );

        const queue = await loadQueue(db, here);

        expect(queue.candidates).toEqual([
          { entryId: "entry-0", grading: "in_progress" },
        ]);
        expect(
          queueWindow(JUDGE, "sponsor", queue.candidates, Infinity),
        ).toEqual([]);
      });
    });
  });

  it("is untimed for a scheduled challenge nobody has scheduled yet", async () => {
    const { db } = fakeDb({ [entries]: ids(["entry-0"]) });

    const queue = await loadQueue(db, input({ challenge: sponsor }));

    expect(queue.timed).toBe(false);
    expect(queue.candidates).toHaveLength(1);
  });
});

describe("assertQueueOffers", () => {
  const order = queueOrder(JUDGE, "general", entryIds);
  const claim = (
    entryId: string,
    answers: Record<string, Rows>,
    over: Partial<Parameters<typeof assertQueueOffers>[1]> = {},
  ) => {
    const fake = fakeDb({ [entries]: ids(entryIds), ...answers });
    return {
      ...fake,
      claim: () =>
        assertQueueOffers(fake.db, {
          hackathonId: HACK,
          judgeId: JUDGE,
          entryId,
          challenge: general,
          challenges,
          ...over,
        }),
    };
  };

  it("lets a judge start any of the first projects their queue offers", async () => {
    for (const entryId of order.slice(0, QUEUE_WINDOW)) {
      await expect(claim(entryId, {}).claim()).resolves.toBeUndefined();
    }
  });

  it("refuses a project further down their queue", async () => {
    for (const entryId of order.slice(QUEUE_WINDOW)) {
      await expect(claim(entryId, {}).claim()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: QUEUE_REFUSAL,
      });
    }
  });

  it("says what to do instead", () => {
    expect(QUEUE_REFUSAL).toBe(
      "Grade the projects your queue offers so every judge sees a random mix. Use Grade next project.",
    );
  });

  it("slides the window past projects that are graded or held", async () => {
    const fourth = order[QUEUE_WINDOW];
    const { claim: go } = claim(fourth, {
      [evaluations]: [{ entryId: order[0], judgeId: "other" }],
      [drafts]: [
        {
          entryId: order[1],
          judgeId: "other",
          updatedAt: minutesAgo(1),
          deadlineAt: null,
        },
        {
          entryId: order[2],
          judgeId: "other",
          updatedAt: minutesAgo(2),
          deadlineAt: null,
        },
      ],
    });

    await expect(go()).resolves.toBeUndefined();
  });

  it("does not slide the window past projects the judge only opened", async () => {
    const held = (entryId: string, revision: number) => ({
      entryId,
      judgeId: JUDGE,
      updatedAt: minutesAgo(1),
      deadlineAt: null,
      revision,
    });
    const opened = order.slice(0, QUEUE_WINDOW).map((id) => held(id, 0));
    await expect(
      claim(order[QUEUE_WINDOW], { [drafts]: opened }).claim(),
    ).rejects.toMatchObject({ message: QUEUE_REFUSAL });

    // Once they save to one, they are grading it, and the window moves on.
    const started = [held(order[0], 1), ...opened.slice(1)];
    await expect(
      claim(order[QUEUE_WINDOW], { [drafts]: started }).claim(),
    ).resolves.toBeUndefined();
  });

  it("does not count a draft left alone past the hold", async () => {
    const { claim: go } = claim(order[0], {
      [drafts]: [
        {
          entryId: order[0],
          judgeId: "other",
          updatedAt: new Date(Date.now() - GRADING_HOLD_MS - 60_000),
          deadlineAt: null,
        },
      ],
    });

    await expect(go()).resolves.toBeUndefined();
  });

  it("asks nothing of a scheduled challenge: the schedule decides", async () => {
    const { claim: go, reads } = claim(
      order[7],
      { [schedules]: [{ id: "schedule" }] },
      { challenge: sponsor },
    );

    await expect(go()).resolves.toBeUndefined();
    expect(reads.some((r) => r.table === entries)).toBe(false);
  });

  it("still asks it of a scheduled challenge nobody has scheduled yet", async () => {
    const worst = queueOrder(JUDGE, "sponsor", entryIds)[7];
    const { claim: go } = claim(worst, {}, { challenge: sponsor });

    await expect(go()).rejects.toMatchObject({ message: QUEUE_REFUSAL });
  });

  describe("under a group, with the list narrowed to one prize", () => {
    const wholeOrder = queueOrder(JUDGE, "mlh", entryIds);
    const prize = (entryId: string, prizeEntries: string[]) =>
      claim(
        entryId,
        {
          [entries]: (call) => ids(call === 0 ? entryIds : prizeEntries),
          [memberships]: [{ challengeId: "mongo" }],
        },
        { challenge: mlh },
      );

    it("offers a project that tops its prize's queue though it is far down the group's", async () => {
      const far = wholeOrder[7];

      await expect(prize(far, [far]).claim()).resolves.toBeUndefined();
    });

    it("refuses a project that is outside the window of the group and of its prize", async () => {
      const prizeEntries = wholeOrder.slice(3, 8);
      const prizeOrder = queueOrder(JUDGE, "mlh", prizeEntries);

      await expect(
        prize(prizeOrder[QUEUE_WINDOW], prizeEntries).claim(),
      ).rejects.toMatchObject({ message: QUEUE_REFUSAL });
    });

    it("checks the group first and stops there when it offers the project", async () => {
      const { claim: go, reads } = prize(wholeOrder[0], []);

      await go();

      expect(reads.filter((r) => r.table === entries)).toHaveLength(1);
      expect(reads.some((r) => r.table === memberships)).toBe(false);
    });
  });
});
