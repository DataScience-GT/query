import { describe, expect, it } from "vitest";
import {
  STARTER_GROUPS,
  chunks,
  derivedMemberships,
  groupForLabel,
  groupingProblem,
  idForLabel,
  initializeGroups,
  planLabels,
  resolveLabels,
} from "./challenges";
import type { ChallengeRow } from "./challenges";
import type { JudgingConfig, JudgingDb } from "./config";

const challenge = (
  id: string,
  over: Partial<ChallengeRow> = {},
): ChallengeRow => ({
  id,
  label: id,
  parentId: null,
  isGroup: false,
  isGeneral: false,
  importLabelMatch: null,
  mode: "scheduled",
  ...over,
});

const general = challenge("general", {
  label: "General",
  isGroup: true,
  isGeneral: true,
});
const mlh = challenge("mlh", {
  label: "MLH Challenges",
  isGroup: true,
  importLabelMatch: "MLH",
  mode: "unscheduled",
});
const sponsors = challenge("sponsors", {
  label: "Sponsor Prizes",
  isGroup: true,
  importLabelMatch: "Best Use of",
});
const snowflake = challenge("snowflake", { label: "Best Use of Snowflake" });
const mongo = challenge("mongo", {
  label: "[MLH] Best Use of MongoDB Atlas",
  parentId: "mlh",
});

describe("chunks", () => {
  it("slices without losing or repeating items", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 2)).toEqual([]);
  });
});

describe("groupForLabel", () => {
  const tree = [general, mlh, sponsors, snowflake, mongo];

  it("files a label under the first group whose match it contains", () => {
    expect(groupForLabel("[MLH] Best Use of Gemini API", tree)?.id).toBe(
      "mlh",
    );
    expect(groupForLabel("Best Use of Databricks", tree)?.id).toBe("sponsors");
  });

  it("ignores case", () => {
    expect(groupForLabel("mlh: best domain name", tree)?.id).toBe("mlh");
  });

  it("is null when no group matches, and never picks a group with no match", () => {
    expect(groupForLabel("Best Overall", tree)).toBeNull();
    expect(
      groupForLabel("General", [challenge("g", { isGroup: true })]),
    ).toBeNull();
  });

  it("skips groups that are blank or not at the top level", () => {
    const blank = challenge("blank", { isGroup: true, importLabelMatch: "  " });
    const nested = challenge("nested", {
      isGroup: true,
      importLabelMatch: "Best",
      parentId: "x",
    });
    expect(groupForLabel("Best Hack", [blank, nested])).toBeNull();
  });
});

describe("planLabels", () => {
  it("reuses challenges by label, ignoring case and spacing, never groups", () => {
    const plan = planLabels(
      ["best use of  snowflake", "MLH Challenges", "Best Overall", "best overall"],
      [general, mlh, snowflake],
    );
    expect([...plan.reuse]).toEqual([["best use of snowflake", "snowflake"]]);
    expect(plan.create).toEqual([
      { label: "MLH Challenges", parentId: "mlh" },
      { label: "Best Overall", parentId: null },
    ]);
  });

  it("files new labels under matching groups", () => {
    const plan = planLabels(
      ["[MLH] Best Use of Gemini API", "Best Use of Databricks"],
      [general, mlh, sponsors],
    );
    expect(plan.create).toEqual([
      { label: "[MLH] Best Use of Gemini API", parentId: "mlh" },
      { label: "Best Use of Databricks", parentId: "sponsors" },
    ]);
  });

  it("skips blank labels", () => {
    expect(planLabels(["  ", ""], []).create).toEqual([]);
  });
});

describe("derivedMemberships", () => {
  const tree = [general, mlh, snowflake, mongo];

  it("adds each opt-in's group and every general challenge", () => {
    const rows = derivedMemberships(
      [
        { entryId: "e1", challengeId: "mongo" },
        { entryId: "e1", challengeId: "snowflake" },
      ],
      ["e1", "e2"],
      tree,
    );
    expect(rows).toEqual([
      { entryId: "e1", challengeId: "mlh" },
      { entryId: "e1", challengeId: "general" },
      { entryId: "e2", challengeId: "general" },
    ]);
  });

  it("leaves out rows that are already opt-ins, and repeats nothing", () => {
    const rows = derivedMemberships(
      [
        { entryId: "e1", challengeId: "general" },
        { entryId: "e1", challengeId: "mongo" },
        { entryId: "e1", challengeId: "mongo" },
      ],
      ["e1"],
      tree,
    );
    expect(rows).toEqual([{ entryId: "e1", challengeId: "mlh" }]);
  });

  it("ignores a parent that is not in the list", () => {
    const orphan = challenge("orphan", { parentId: "deleted-group" });
    expect(
      derivedMemberships(
        [{ entryId: "e1", challengeId: "orphan" }],
        ["e1"],
        [orphan],
      ),
    ).toEqual([]);
  });
});

describe("groupingProblem", () => {
  const tree = [general, mlh, snowflake, mongo];
  const plain = { id: "snowflake", isGroup: false, isGeneral: false };

  it("allows the top level and a top-level group", () => {
    expect(groupingProblem(tree, plain, null)).toBeNull();
    expect(groupingProblem(tree, plain, "mlh")).toBeNull();
    expect(
      groupingProblem(tree, { id: null, isGroup: false, isGeneral: false }, "general"),
    ).toBeNull();
  });

  it("refuses a parent that is not a group, missing, or itself", () => {
    expect(groupingProblem(tree, plain, "mongo")).toMatch(/Only a group/);
    expect(groupingProblem(tree, plain, "nope")).toMatch(/not part of/);
    expect(
      groupingProblem(tree, { ...plain, id: "mlh", isGroup: true }, "mlh"),
    ).toMatch(/inside itself/);
  });

  it("refuses nesting groups and moving a general challenge down", () => {
    expect(
      groupingProblem(tree, { id: "sponsors", isGroup: true, isGeneral: false }, "mlh"),
    ).toMatch(/A group cannot sit inside/);
    expect(
      groupingProblem(tree, { ...plain, isGeneral: true }, "mlh"),
    ).toMatch(/general challenge/);
  });

  it("refuses a group that is itself nested", () => {
    const nestedGroup = challenge("nested", { isGroup: true, parentId: "mlh" });
    expect(groupingProblem([...tree, nestedGroup], plain, "nested")).toMatch(
      /top level/,
    );
  });
});

// Records every query-builder call; awaiting a builder resolves the next
// queued result for its kind of statement.
type Op = "select" | "insert" | "update" | "delete";
function fakeDb(queue: Partial<Record<Op, unknown[][]>> = {}) {
  const log: { op: Op; calls: [string, unknown[]][] }[] = [];
  const start = (op: Op) => {
    const entry = { op, calls: [] as [string, unknown[]][] };
    log.push(entry);
    const builder: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const result = queue[op]?.shift() ?? [];
            return (resolve: (value: unknown) => void) => resolve(result);
          }
          return (...args: unknown[]) => {
            entry.calls.push([String(prop), args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  const db = {
    select: () => start("select"),
    insert: () => start("insert"),
    update: () => start("update"),
    delete: () => start("delete"),
  };
  const argsOf = (op: Op, method: string) =>
    log
      .filter((entry) => entry.op === op)
      .flatMap((entry) => entry.calls)
      .filter(([name]) => name === method)
      .map(([, args]) => args[0]);
  return { db: db as unknown as JudgingDb, log, argsOf };
}

const config = (over: Partial<JudgingConfig> = {}) =>
  ({
    hackathonId: "h1",
    groupsInitializedAt: null,
    ...over,
  }) as JudgingConfig;

describe("initializeGroups", () => {
  it("does nothing once the edition has been seeded", async () => {
    const { db, log } = fakeDb();
    await expect(
      initializeGroups(db, "h1", config({ groupsInitializedAt: new Date() })),
    ).resolves.toBe(false);
    expect(log).toEqual([]);
  });

  it("seeds General and MLH Challenges and records that it did", async () => {
    const { db, argsOf } = fakeDb({ select: [[]] });
    await expect(initializeGroups(db, "h1", config())).resolves.toBe(true);

    const [values] = argsOf("insert", "values") as Record<string, unknown>[][];
    expect(values).toEqual(
      STARTER_GROUPS.map((group) => ({ ...group, hackathonId: "h1" })),
    );
    expect(values![0]).toMatchObject({
      label: "General",
      isGeneral: true,
      mode: "scheduled",
    });
    expect(values![1]).toMatchObject({
      label: "MLH Challenges",
      importLabelMatch: "MLH",
      mode: "unscheduled",
    });
    const [set] = argsOf("update", "set") as Record<string, unknown>[];
    expect(set!.groupsInitializedAt).toBeInstanceOf(Date);
  });

  it("does not compete with a group that already collects MLH labels", async () => {
    const { db, argsOf } = fakeDb({
      select: [[challenge("mine", { isGroup: true, importLabelMatch: "mlh" })]],
    });
    await initializeGroups(db, "h1", config());
    const [values] = argsOf("insert", "values") as Record<string, unknown>[][];
    expect(values!.map((v) => v.importLabelMatch)).toEqual([null, null]);
  });
});

describe("resolveLabels", () => {
  it("returns existing ids and inserts the rest once", async () => {
    const { db, argsOf } = fakeDb({
      select: [[general, mlh, snowflake]],
      insert: [[{ id: "new-1", label: "[MLH] Best Use of Gemini API" }]],
    });
    const { ids, created } = await resolveLabels(db, "h1", [
      "Best Use of Snowflake",
      "[MLH] Best Use of Gemini API",
      "[mlh] best use of gemini api",
    ]);

    expect(created).toBe(1);
    expect(idForLabel(ids, "best use of snowflake")).toBe("snowflake");
    expect(idForLabel(ids, "[MLH]  Best Use of Gemini API")).toBe("new-1");
    expect(argsOf("insert", "values")).toEqual([
      [
        {
          label: "[MLH] Best Use of Gemini API",
          parentId: "mlh",
          hackathonId: "h1",
        },
      ],
    ]);
  });

  it("inserts nothing when every label is known", async () => {
    const { db, log } = fakeDb({ select: [[snowflake]] });
    const { created } = await resolveLabels(db, "h1", ["Best Use of Snowflake"]);
    expect(created).toBe(0);
    expect(log.some((entry) => entry.op === "insert")).toBe(false);
  });
});
