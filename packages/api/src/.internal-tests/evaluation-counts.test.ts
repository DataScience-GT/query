/**
 * Counts of evaluations that organisers and hackers read agree with placings:
 * an evaluation counts once it holds a rating for every rating item, whether
 * or not a written response was left empty, which is what an auto-submit at
 * the deadline often leaves. The organiser's overview and project list, the
 * hacker's feedback and the status the itinerary reports all read it that way,
 * and none reads the judge's own "submitted whole" flag.
 *
 * The schema is the real one; only the database handle is a stand-in, handed
 * to the router through the context the way check-in-flags-organizer.test.ts
 * does. It answers each select by the table it reads from, so what these tests
 * look at is the SQL each router asks the database to apply (the rule is
 * checked against scoring.hasEveryRating in services/judging/scoring-sql.test.ts)
 * and what the router makes of the rows it is given.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  hackathonParticipants,
  hackathons,
  judgingAppointments,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationResponses,
  judgingEvaluations,
  judgingPresence,
  judgingRooms,
} from "@query/db";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import type * as Store from "../services/judging/evaluation-store";

// Nothing is due on any read here, so there is nothing to reconcile.
vi.mock("../services/judging/evaluation-store", async (importActual) => ({
  ...(await importActual<typeof Store>()),
  reconcileDueDrafts: async () => undefined,
}));

const HACK = "11111111-1111-4111-8111-111111111111";
const ENTRY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const GENERAL = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const ROOM = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const SLOT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const EVAL_1 = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const EVAL_2 = "ffffffff-ffff-4fff-8fff-fffffffffff2";

const dialect = new PgDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as never);
/** The SQL with its spacing and parameter numbers evened out. */
const flat = (condition: unknown) =>
  render(condition)
    .sql.replace(/\s+/g, " ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")")
    .replace(/\$\d+/g, "$?");

// scoring.hasEveryRating, as SQL: the evaluation's ratings are at least as
// many as the rubric's rating items.
const HOLDS_EVERY_RATING =
  '(select count(*) from "judging_evaluation_rating" as r where r."evaluation_id" = "judging_evaluation"."id") >= (select count(*) from "judging_rubric_item" as i where i."hackathon_id" = $? and i."kind" = \'rating\')';

type Row = Record<string, any>;
type SelectCall = {
  fields: Record<string, unknown> | undefined;
  table: unknown;
  where: unknown;
};

let adminRow: Row | undefined;
const selects: SelectCall[] = [];
// The rows each table answers with, whatever condition it was asked for.
const rows = new Map<unknown, Row[]>();

const fakeDb: any = {
  query: { admins: { findFirst: async () => adminRow } },
  select: (fields?: Record<string, unknown>) => {
    const call: SelectCall = { fields, table: null, where: null };
    selects.push(call);
    const chain: any = {
      then: (onOk: any, onErr: any) =>
        Promise.resolve(rows.get(call.table) ?? []).then(onOk, onErr),
    };
    chain.from = (table: unknown) => {
      call.table = table;
      return chain;
    };
    chain.where = (where: unknown) => {
      call.where = where;
      return chain;
    };
    for (const method of [
      "innerJoin",
      "leftJoin",
      "groupBy",
      "orderBy",
      "limit",
      "offset",
      "for",
    ]) {
      chain[method] = () => chain;
    }
    return chain;
  },
  insert: () => ({
    values: () =>
      Object.assign(Promise.resolve(undefined), {
        onConflictDoNothing: () => ({ returning: async () => [] }),
        returning: async () => [{ id: "row" }],
      }),
  }),
  delete: () => ({ where: async () => [] }),
  transaction: async (callback: (tx: unknown) => unknown) => callback(fakeDb),
};

const callerAs = (userId: string) =>
  appRouter.createCaller({
    db: fakeDb,
    session: { user: { id: userId } },
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as any);
const admin = () => callerAs("admin_user");
const hacker = () => callerAs("hacker_user");

const callsOn = (table: unknown) =>
  selects.filter((call) => call.table === table);

const at = (time: string) => new Date(`2027-02-06T${time}:00Z`);

const config = (over: Row = {}) => ({
  hackathonId: HACK,
  state: "open",
  openedAt: null,
  closedAt: null,
  showAllScores: false,
  inventoryLockedAt: null,
  groupsInitializedAt: null,
  itineraryPublished: true,
  emergencyMode: false,
  claimsStartedAt: null,
  ...over,
});

beforeEach(() => {
  cache.clear();
  selects.length = 0;
  rows.clear();
  adminRow = { userId: "admin_user", isActive: true, role: "admin" };
  rows.set(hackathons, [{ id: HACK, name: "Hacklytics 2027" }]);
  rows.set(judgingConfigs, [config()]);
});

// ---------------------------------------------------------------------------
describe("judging.admin.overview", () => {
  it("counts the evaluations that hold every rating, not the ones submitted whole", async () => {
    rows.set(judgingEvaluations, [{ total: 5, complete: 3 }]);

    const { counts } = await admin().judging.admin.overview({
      hackathonId: HACK,
    });

    expect(counts.evaluations).toMatchObject({ total: 5, complete: 3 });
    const aggregate = callsOn(judgingEvaluations).find(
      (call) => call.fields && "complete" in call.fields,
    )!;
    const text = flat(aggregate.fields!.complete);
    expect(text).toContain(`filter (where ${HOLDS_EVERY_RATING})`);
    expect(text).not.toContain("is_complete");
    // For this edition's rubric.
    expect(render(aggregate.fields!.complete).params).toEqual([HACK]);
  });
});

// ---------------------------------------------------------------------------
describe("judging.admin.listEntries", () => {
  it("counts each project's evaluations that hold every rating", async () => {
    rows.set(judgingEntries, [
      {
        id: ENTRY,
        title: "Tidewater",
        value: 1,
        deletedAt: null,
        prizeIneligible: false,
      },
    ]);
    rows.set(judgingEvaluations, [{ entryId: ENTRY, value: 2 }]);

    const page = await admin().judging.admin.listEntries({ hackathonId: HACK });

    expect(page.entries[0]).toMatchObject({
      id: ENTRY,
      completeEvaluations: 2,
    });
    const [counted] = callsOn(judgingEvaluations);
    const text = flat(counted!.where);
    expect(text).toContain(HOLDS_EVERY_RATING);
    expect(text).not.toContain("is_complete");
    expect(render(counted!.where).params).toEqual([ENTRY, HACK]);
  });
});

// ---------------------------------------------------------------------------
describe("hackathon participant reads", () => {
  const ratedResponse = (
    evaluationId: string,
    label: string,
    value: string,
  ) => ({
    evaluationId,
    label,
    displayOrder: 1,
    value,
  });

  beforeEach(() => {
    rows.set(hackathonParticipants, [{ status: "checked_in" }]);
    rows.set(judgingEntryMembers, [
      {
        memberId: "m1",
        entryId: ENTRY,
        title: "Tidewater",
        participantCount: 2,
        deletedAt: null,
      },
    ]);
    rows.set(judgingChallenges, [
      {
        id: GENERAL,
        parentId: null,
        mode: "scheduled",
        label: "General",
        displayOrder: 0,
        isGeneral: true,
        isGroup: false,
      },
    ]);
  });

  describe("judging.hacker.feedback", () => {
    it("asks only for member evaluations that hold every rating", async () => {
      rows.set(judgingEvaluations, []);

      await hacker().judging.hacker.feedback({ hackathonId: HACK });

      const [read] = callsOn(judgingEvaluations);
      const text = flat(read!.where);
      expect(text).toContain(HOLDS_EVERY_RATING);
      expect(text).not.toContain("is_complete");
      // Of this project, in this edition, by a member judge.
      expect(render(read!.where).params).toEqual(
        expect.arrayContaining([HACK, ENTRY, "member"]),
      );
    });

    it("shows the written responses that exist and leaves out the ones left empty", async () => {
      // The first auto-submitted at the deadline with every rating and one
      // response; the second has none written at all.
      rows.set(judgingEvaluations, [
        { id: EVAL_1, challengeId: GENERAL, submittedAt: at("15:00") },
        { id: EVAL_2, challengeId: GENERAL, submittedAt: at("15:10") },
      ]);
      rows.set(judgingEvaluationResponses, [
        ratedResponse(EVAL_1, "Strengths", " Clear demo "),
        { ...ratedResponse(EVAL_1, "Next steps", ""), displayOrder: 2 },
      ]);

      const feedback = await hacker().judging.hacker.feedback({
        hackathonId: HACK,
      });

      expect(feedback).toEqual({
        available: true,
        items: [
          {
            challenge: "General",
            responses: [{ label: "Strengths", value: "Clear demo" }],
          },
        ],
      });
    });

    it("asks for public responses only", async () => {
      rows.set(judgingEvaluations, [
        { id: EVAL_1, challengeId: GENERAL, submittedAt: at("15:00") },
      ]);

      await hacker().judging.hacker.feedback({ hackathonId: HACK });

      const [read] = callsOn(judgingEvaluationResponses);
      expect(flat(read!.where)).toContain(
        '"judging_evaluation_response"."is_public" = $?',
      );
      expect(render(read!.where).params).toContain(true);
    });
  });

  describe("judging.hacker.itinerary", () => {
    beforeEach(() => {
      rows.set(judgingEntries, [{ id: ENTRY, title: "Tidewater" }]);
      rows.set(judgingEntryChallenges, [{ challengeId: GENERAL }]);
      rows.set(judgingRooms, [
        {
          id: ROOM,
          challengeId: GENERAL,
          name: "Table 1",
          kind: "table",
          building: null,
          displayOrder: 0,
          archivedAt: null,
        },
      ]);
      rows.set(judgingAppointments, [
        {
          id: SLOT,
          challengeId: GENERAL,
          roomId: ROOM,
          startsAt: at("10:00"),
          endsAt: at("10:10"),
        },
      ]);
      rows.set(judgingPresence, []);
    });

    const evaluation = (ratingsComplete: boolean) => ({
      judgeId: "judge-1",
      challengeId: GENERAL,
      appointmentId: SLOT,
      ratingsComplete,
    });
    const statusOfSlot = async () => {
      const itinerary = await hacker().judging.hacker.itinerary({
        hackathonId: HACK,
      });
      return itinerary.appointments.map((a) => a.status);
    };

    it("reads whether an evaluation holds every rating, not whether it was submitted whole", async () => {
      rows.set(judgingEvaluations, [evaluation(true)]);

      await statusOfSlot();

      const [read] = callsOn(judgingEvaluations);
      expect(flat(read!.fields!.ratingsComplete)).toBe(HOLDS_EVERY_RATING);
      expect(read!.fields).not.toHaveProperty("isComplete");
      expect(render(read!.fields!.ratingsComplete).params).toEqual([HACK]);
    });

    it("calls a presentation judged once its evaluation holds every rating", async () => {
      rows.set(judgingEvaluations, [evaluation(true)]);
      await expect(statusOfSlot()).resolves.toEqual(["complete"]);
    });

    it("calls it presented while an evaluation is short of a rating", async () => {
      rows.set(judgingEvaluations, [evaluation(false)]);
      await expect(statusOfSlot()).resolves.toEqual(["incomplete"]);
    });
  });
});
