import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type * as ChildProcess from "node:child_process";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cpsatProblem, readCpsatSolution } from "./cpsat-bridge";
import { CPSAT_UNAVAILABLE, cpsatAvailable, runCpsat } from "./cpsat-runner";
import type { PlanInputs } from "./inputs";

// Node stands in for Python: each test writes a small script that behaves
// like one way cpsat.py can end. Node has no -I, so the spawn below drops it
// for Node only, and records what the runner asked for.
const spawned = vi.hoisted(
  () => [] as { command: string; args: string[]; child: ChildProcess.ChildProcess }[],
);
vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcess>();
  return {
    ...real,
    spawn: (command: string, args: string[], options: ChildProcess.SpawnOptions) => {
      const forNode = command === process.execPath ? args.filter((a) => a !== "-I") : args;
      const child = real.spawn(command, forNode, options);
      spawned.push({ command, args, child });
      return child;
    },
  };
});

const inputs: PlanInputs = {
  rooms: [
    { id: "g1", challengeId: "general", buildingId: "ENG" },
    { id: "g2", challengeId: "general", buildingId: "HEC" },
    { id: "s1", challengeId: "sp1", buildingId: "HEC" },
  ],
  tasks: [
    { entryId: "a", challengeId: "general", sponsor: false },
    { entryId: "a", challengeId: "sp1", sponsor: true },
    { entryId: "b", challengeId: "general", sponsor: false },
    { entryId: "b", challengeId: "sp1", sponsor: true },
    { entryId: "c", challengeId: "general", sponsor: false },
  ],
  slots: 4,
  sameGap: 1,
  crossGap: 2,
};

// The optimum (see cpsat-bridge.test.ts), sent as the hint so the fake
// script can hand it back.
const problem = cpsatProblem(inputs, "fp-test", [
  { entryId: "a", challengeId: "general", roomId: "g2", slot: 2 },
  { entryId: "a", challengeId: "sp1", roomId: "s1", slot: 0 },
  { entryId: "b", challengeId: "general", roomId: "g2", slot: 3 },
  { entryId: "b", challengeId: "sp1", roomId: "s1", slot: 1 },
  { entryId: "c", challengeId: "general", roomId: "g2", slot: 0 },
]);

/** Reads the problem file it is given, then runs `body` with it as `problem`. */
const reading = (body: string) => `
{
  const problem = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
  const answer = (status, placements) =>
    process.stdout.write(JSON.stringify({
      format: "query-judging-schedule-solution",
      version: 1,
      fingerprint: problem.fingerprint,
      status,
      relaxed: false,
      placements,
      reasons: status === "infeasible" ? ["challenge sp1: 3 presentations but only 2 room slots"] : [],
    }));
  ${body}
}
`;

const dir = mkdtempSync(join(tmpdir(), "cpsat-runner-"));
let scripts = 0;

/** Points JUDGING_CPSAT_SCRIPT at a new fake cpsat.py. */
function fakeScript(source: string) {
  const path = join(dir, `fake-${++scripts}.js`);
  writeFileSync(path, source);
  vi.stubEnv("JUDGING_CPSAT_SCRIPT", path);
}

beforeEach(() => {
  spawned.length = 0;
  vi.stubEnv("JUDGING_CPSAT_PYTHON", process.execPath);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("cpsatAvailable", () => {
  it("needs JUDGING_CPSAT_PYTHON", async () => {
    fakeScript("");
    vi.stubEnv("JUDGING_CPSAT_PYTHON", "");
    expect(cpsatAvailable()).toBe(false);
    expect(await runCpsat(problem)).toEqual({
      status: "failed",
      reason: CPSAT_UNAVAILABLE,
      log: [],
    });
    expect(spawned).toHaveLength(0);
  });

  it("needs the script", () => {
    vi.stubEnv("JUDGING_CPSAT_SCRIPT", join(dir, "missing.py"));
    expect(cpsatAvailable()).toBe(false);
  });

  it("finds cpsat.py in the repo when JUDGING_CPSAT_SCRIPT is unset", () => {
    vi.stubEnv("JUDGING_CPSAT_SCRIPT", "");
    expect(cpsatAvailable()).toBe(true);
  });
});

describe("runCpsat", () => {
  it("passes the problem as a file and returns what the script printed", async () => {
    fakeScript(reading(`console.error("strict: full cross-building breaks"); answer("optimal", problem.hint);`));
    const run = await runCpsat(problem);
    expect(run).toMatchObject({
      status: "solved",
      log: ["strict: full cross-building breaks"],
    });
    if (run.status !== "solved") throw new Error("should have solved");

    // The output is read like an upload: fingerprint and rules both checked.
    expect(readCpsatSolution(inputs, "fp-test", run.solution)).toMatchObject({
      ok: true,
      score: [2, 0, 4, 0, -2],
    });
    // cpsat.py takes a path, the same as on an organiser's laptop. The file
    // is gone once the run is over.
    const file = spawned[0]!.args[2]!;
    expect(file).toMatch(/problem\.json$/);
    expect(existsSync(file)).toBe(false);
    expect(spawned[0]!.command).toBe(process.execPath);
    expect(spawned[0]!.args).toEqual([
      "-I",
      join(dir, `fake-${scripts}.js`),
      file,
      "--time-limit",
      "20",
      "--workers",
      String(Math.min(4, availableParallelism())),
    ]);
  });

  it("keeps the time limit between 5 and 60 seconds", async () => {
    fakeScript(reading(`answer("optimal", problem.hint);`));
    await runCpsat(problem, { seconds: 1 });
    await runCpsat(problem, { seconds: 600 });
    expect(spawned.map((s) => s.args[4])).toEqual(["5", "60"]);
  });

  it("passes on a proof of infeasibility and a timeout, with the file", async () => {
    fakeScript(reading(`answer("infeasible", []); process.exitCode = 2;`));
    const infeasible = await runCpsat(problem);
    expect(infeasible.status).toBe("infeasible");
    if (infeasible.status !== "infeasible") return;
    const read = readCpsatSolution(inputs, "fp-test", infeasible.solution);
    expect(read).toMatchObject({ ok: false });
    if (!read.ok) expect(read.reason).toContain("3 presentations but only 2 room slots");

    fakeScript(reading(`answer("unknown", []); process.exitCode = 3;`));
    expect(await runCpsat(problem)).toMatchObject({ status: "timedOut" });
  });

  it("fails with the end of the log when the script does", async () => {
    fakeScript(`
for (let i = 1; i <= 30; i++) console.error("line " + i);
process.exitCode = 1;
`);
    const run = await runCpsat(problem);
    expect(run.status).toBe("failed");
    if (run.status !== "failed") return;
    expect(run.log).toHaveLength(20);
    expect(run.log[0]).toBe("line 11");
    expect(run.reason).toContain("exit code 1");
    expect(run.reason).toContain("line 30");
  });

  it("fails when Python cannot start", async () => {
    fakeScript("");
    vi.stubEnv("JUDGING_CPSAT_PYTHON", join(dir, "no-such-python"));
    const run = await runCpsat(problem);
    expect(run.status).toBe("failed");
    if (run.status === "failed") expect(run.reason).toContain("could not start");
  });

  it("kills a run that outlives its time limit", async () => {
    fakeScript(`setInterval(() => undefined, 1000);`);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const running = runCpsat(problem, { seconds: 5 });
    // The clock starts with the script, once the problem file is written.
    while (spawned.length === 0) await new Promise((next) => setImmediate(next));
    // 5 seconds for each of two attempts, plus 60 to start and build.
    await vi.advanceTimersByTimeAsync(69_000);
    expect(spawned[0]!.child.killed).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawned[0]!.child.killed).toBe(true);

    const run = await running;
    expect(run.status).toBe("failed");
    if (run.status === "failed") expect(run.reason).toContain("after 70 seconds");
  });
});

// The real thing, when a Python with OR-Tools is at hand:
//   CPSAT_TEST_PYTHON=/path/to/python npx vitest run <this file>
// eslint-disable-next-line turbo/no-undeclared-env-vars
const realPython = process.env.CPSAT_TEST_PYTHON;

describe.runIf(realPython)("runCpsat with cpsat.py", () => {
  it("solves the bundled example", { timeout: 60_000 }, async () => {
    vi.stubEnv("JUDGING_CPSAT_PYTHON", realPython!);
    vi.stubEnv("JUDGING_CPSAT_SCRIPT", "");
    const example = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("../../../../scripts/judging-schedule/example-problem.json", import.meta.url),
        ),
        "utf8",
      ),
    );
    const run = await runCpsat(example, { seconds: 5 });
    expect(run).toMatchObject({ status: "solved" });
    if (run.status !== "solved") return;

    const exampleInputs: PlanInputs = {
      rooms: example.rooms.map((r: PlanInputs["rooms"][number]) => ({
        id: r.id,
        challengeId: r.challengeId,
        buildingId: r.buildingId,
      })),
      tasks: example.tasks,
      slots: example.slotCount,
      sameGap: example.sameGap,
      crossGap: example.crossGap,
    };
    expect(readCpsatSolution(exampleInputs, example.fingerprint, run.solution)).toMatchObject({
      ok: true,
    });
  });
});
