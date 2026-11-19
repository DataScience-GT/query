// run_check: `pnpm turbo run <task> [--filter=<workspace>]` from the repo root,
// for the four tasks CI runs. Nothing else is runnable through the server.
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { ROOT } from "./source.ts";
import { workspaceNames } from "./workspace.ts";

export const TASKS = ["lint", "typecheck", "test", "build"] as const;
export type Task = (typeof TASKS)[number];

const TIMEOUT_MS = 10 * 60 * 1000;
const TAIL_LINES = 80;
const TAIL_CHARS = 8000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DB_VARS = ["DATABASE_URL", "TEST_DATABASE_URL"];

type Env = Record<string, string | undefined>;

/**
 * Why a test or build must not start, or null. Tests and builds read the
 * database URL, so one that points off this machine (Neon, anything remote) is
 * refused. Unset is fine: the suites mock the database.
 */
export function dbRefusal(task: Task, env: Env): string | null {
  if (task !== "test" && task !== "build") return null;
  for (const name of DB_VARS) {
    const value = env[name];
    if (!value) continue;
    let host: string | null = null;
    try {
      host = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    } catch {
      // unparseable: treated as remote below
    }
    if (!host || !LOCAL_HOSTS.has(host))
      return `Refusing to run ${task}: ${name} points at ${host ?? "an unparseable URL"}, not a local database. Unset it or use a disposable local Postgres.`;
  }
  return null;
}

const GUARD = resolve(ROOT, "tooling/scripts/src/guard-local.ts");

/**
 * Runs the repo's own guard, the one `pnpm test` runs first. It also reads the
 * root .env, sites/mainweb/.env and .env.local, which Next and drizzle load,
 * so a remote URL in a file is caught as well as one in the environment.
 * `guardFile` is a parameter so a test can run a copy rooted in a temp folder.
 */
export function guardRefusal(
  task: Task,
  env: Env,
  guardFile = GUARD,
): string | null {
  if (task !== "test" && task !== "build") return null;
  const run = spawnSync(process.execPath, [guardFile], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  if (run.status === 0) return null;
  const output = `${run.stderr ?? ""}${run.stdout ?? ""}`.trim();
  return `Refusing to run ${task}: ${output || run.error?.message || "the local-services guard failed"}`;
}

export function checkArgs(task: string, filter?: string): string[] {
  if (!(TASKS as readonly string[]).includes(task))
    throw new Error(`Unknown task "${task}". Allowed: ${TASKS.join(", ")}`);
  const args = ["turbo", "run", task];
  if (filter) {
    const names = workspaceNames();
    if (!names.includes(filter))
      throw new Error(
        `Unknown workspace "${filter}". Known: ${names.join(", ")}`,
      );
    args.push(`--filter=${filter}`);
  }
  return args;
}

// oxlint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function tail(output: string): string {
  const lines = output.replace(ANSI, "").split(/\r?\n/);
  let text = lines.slice(-TAIL_LINES).join("\n");
  if (text.length > TAIL_CHARS) text = text.slice(-TAIL_CHARS);
  return text.trim();
}

function killTree(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

export async function runCheck(
  task: string,
  filter?: string,
  env: Env = process.env,
): Promise<{ ok: boolean; text: string }> {
  const args = checkArgs(task, filter);
  const refusal = dbRefusal(task as Task, env);
  if (refusal) throw new Error(refusal);
  const guard = guardRefusal(task as Task, env);
  if (guard) throw new Error(guard);
  const command = `pnpm ${args.join(" ")}`;
  const started = Date.now();
  return new Promise<{ ok: boolean; text: string }>((done) => {
    // Every argument was validated above, so the shell (needed on Windows to
    // find pnpm.cmd) has nothing to interpret.
    const child = spawn(command, {
      cwd: ROOT,
      env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" },
      shell: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    // Keep memory bounded on a chatty build; only the tail is ever returned.
    const take = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > 200_000) output = output.slice(-100_000);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, TIMEOUT_MS);
    const finish = (code: number | null, note = "") => {
      clearTimeout(timer);
      const seconds = Math.round((Date.now() - started) / 1000);
      const status = timedOut
        ? `TIMED OUT after ${TIMEOUT_MS / 60000} min`
        : `exit code ${code}`;
      done({
        ok: code === 0 && !timedOut,
        text: `${command}\n${status}${note} (${seconds}s)\n\n${tail(output)}`,
      });
    };
    child.on("error", (error) => finish(null, ` (${error.message})`));
    child.on("close", (code) => finish(code));
  });
}
