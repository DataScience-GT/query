import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Runs the CP-SAT script on this server, for hosts that have a Python with
// OR-Tools, so an organiser does not have to download the problem and run it
// on a laptop. It is the same script fed the same problem file, and what it
// prints is read exactly like an upload (readCpsatSolution, or
// readCpsatAssignments when only the judges are assigned): this file only
// starts the process and reports how it ended, it never decides whether a
// schedule is good.
//
//   JUDGING_CPSAT_PYTHON  the Python to run it with: a command ("python3")
//                         or a path. Unset means CP-SAT is unavailable here.
//   JUDGING_CPSAT_SCRIPT  where cpsat.py is. By default, the first
//                         packages/api/scripts/judging-schedule/cpsat.py found
//                         walking up from the working directory (Next runs
//                         from sites/mainweb, tests from the repo root).

const SCRIPT_IN_REPO = join("packages", "api", "scripts", "judging-schedule", "cpsat.py");

export const CPSAT_UNAVAILABLE =
  "CP-SAT is not installed on this server. Download the problem and run the script instead.";

/** CP-SAT's time limit for each attempt (strict, then relaxed), in seconds. */
export const CPSAT_SECONDS = { min: 5, max: 60, default: 20 } as const;

/** Lines of the script's log kept for error messages. */
const LOG_LINES = 20;

/**
 * How many times the script may use its whole time limit on `problem`: twice
 * to place the presentations (strict, then relaxed) unless the schedule is
 * given, and once more to assign judges when there are any.
 */
function timeLimits(problem: unknown): number {
  const shape = problem as { judges?: unknown; placements?: unknown } | null;
  const judged = Array.isArray(shape?.judges) && shape.judges.length > 0;
  return (Array.isArray(shape?.placements) ? 0 : 2) + (judged ? 1 : 0);
}

type Command = { python: string; script: string };

let probe: { env: string; command: Command | null } | undefined;

/**
 * The Python and script to run, or null when CP-SAT is unavailable. Found
 * once per process (again only if the variables change, as tests do) and
 * without starting Python, so asking costs nothing.
 */
function cpsatCommand(): Command | null {
  // Settings of the running server; nothing turbo builds depends on them.
  // oxlint-disable-next-line turbo/no-undeclared-env-vars
  const python = process.env.JUDGING_CPSAT_PYTHON?.trim() ?? "";
  // oxlint-disable-next-line turbo/no-undeclared-env-vars
  const configured = process.env.JUDGING_CPSAT_SCRIPT?.trim() ?? "";
  const env = `${python}\n${configured}`;
  if (probe?.env !== env) {
    const script = !python ? null : configured ? resolve(configured) : findScript();
    probe = {
      env,
      command: script && existsSync(script) ? { python, script } : null,
    };
  }
  return probe.command;
}

function findScript(): string | null {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, SCRIPT_IN_REPO);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/** Whether this server can run CP-SAT itself. */
export function cpsatAvailable(): boolean {
  return cpsatCommand() !== null;
}

export type CpsatRun =
  | {
      /**
       * How cpsat.py exited: 0 a schedule, 2 proof that none exists, 3 out of
       * time before finding one. It prints a solution file in all three.
       */
      status: "solved" | "infeasible" | "timedOut";
      /** What it printed. Untrusted: read it with readCpsatSolution. */
      solution: string;
      /** The end of its log (stderr). */
      log: string[];
    }
  | { status: "failed"; reason: string; log: string[] };

const cancelled = (log: string[] = []): CpsatRun => ({
  status: "failed",
  reason: "CP-SAT was cancelled before it finished.",
  log,
});

/**
 * Runs cpsat.py on `problem` (a cpsatProblem) and waits for it. The problem
 * goes in as a file, as when an organiser runs the script, and the solution
 * comes back on stdout. CP-SAT stops itself at its time limit; the process is
 * killed if it is still running well past that, or as soon as `signal` fires
 * (the request that asked for the run went away).
 */
export async function runCpsat(
  problem: unknown,
  options: { seconds?: number; signal?: AbortSignal } = {},
): Promise<CpsatRun> {
  const command = cpsatCommand();
  if (!command) return { status: "failed", reason: CPSAT_UNAVAILABLE, log: [] };
  const { signal } = options;
  if (signal?.aborted) return cancelled();
  const seconds = Math.min(
    CPSAT_SECONDS.max,
    Math.max(CPSAT_SECONDS.min, Math.round(options.seconds ?? CPSAT_SECONDS.default)),
  );
  const workers = Math.min(4, availableParallelism());
  // Up to two attempts of `seconds` each, and one more for the judges.
  // Starting Python, loading OR-Tools and building the model for each attempt
  // come on top and do not depend on `seconds`: on a busy machine they took
  // close to 30 seconds for a 2,000-presentation edition, so the margin leaves
  // room for twice that.
  const killAfter = seconds * timeLimits(problem) + 60;

  // A directory of its own, so two runs at once never share a file.
  const dir = await mkdtemp(join(tmpdir(), "cpsat-"));
  try {
    const file = join(dir, "problem.json");
    await writeFile(file, JSON.stringify(problem));
    return await new Promise<CpsatRun>((done) => {
      // It may have fired while the file was being written.
      if (signal?.aborted) return done(cancelled());
      const child = spawn(
        command.python,
        ["-I", command.script, file, "--time-limit", String(seconds), "--workers", String(workers)],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
      );
      const stdout: Buffer[] = [];
      let stderr = "";
      let killed = false;
      let aborted = false;
      let settled = false;

      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, killAfter * 1000);
      // The run settles once the process has exited (close), not when it is
      // told to, so the temp directory is never removed from under it.
      const onAbort = () => {
        aborted = true;
        child.kill("SIGKILL");
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const finish = (run: CpsatRun) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        done(run);
      };
      const log = () =>
        stderr
          .split(/\r?\n/)
          .filter((line) => line.trim() !== "")
          .slice(-LOG_LINES);

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        // Only the end is ever shown.
        stderr = (stderr + chunk).slice(-16_384);
      });

      child.on("error", (error) =>
        finish({
          status: "failed",
          reason: `CP-SAT could not start (${command.python}): ${error.message}`,
          log: log(),
        }),
      );
      child.on("close", (code, exitSignal) => {
        if (aborted) return finish(cancelled(log()));
        if (killed) {
          return finish({
            status: "failed",
            reason: `CP-SAT was still running after ${killAfter} seconds, so the server stopped it. Download the problem and run the script instead.`,
            log: log(),
          });
        }
        const status =
          code === 0 ? "solved" : code === 2 ? "infeasible" : code === 3 ? "timedOut" : null;
        if (status) {
          return finish({ status, solution: Buffer.concat(stdout).toString("utf8"), log: log() });
        }
        // 1 is bad input or a broken install; anything else is a crash.
        const how = code === null ? `signal ${exitSignal}` : `exit code ${code}`;
        const lines = log();
        finish({
          status: "failed",
          reason: `CP-SAT stopped with ${how}.${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`,
          log: lines,
        });
      });
    });
  } finally {
    // A file left in the temp directory harms nothing, so a failed cleanup
    // never replaces the run's result.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
