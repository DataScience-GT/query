/**
 * Refuses to run a command that could touch production from a dev machine.
 *
 *   node tooling/scripts/src/guard-local.ts [--db] [--stripe] [--email]
 *
 * No flag runs every check. It sits in front of `migrate:push`, the seed
 * scripts, `pnpm test` and `pnpm local:up`:
 *
 *   --db      DATABASE_URL must point at localhost, 127.0.0.1, ::1 or a compose
 *             service name (db, postgres). An unset URL passes: there is
 *             nothing to hit.
 *   --stripe  Live keys (sk_live_, rk_live_, pk_live_) are refused unless
 *             NODE_ENV is production. No override: test mode is always enough.
 *   --email   EMAIL_SERVER_HOST must be local, so a stray SMTP login cannot
 *             mail real people from a dev machine.
 *
 * ALLOW_NON_LOCAL_SERVICES=1 waives --db and --email, for the day someone
 * really does mean to push a schema to a hosted database.
 *
 * Values come from the environment first, then the root .env, which is the
 * order dotenv (and so drizzle.config.ts) resolves them in. Deploys run
 * `drizzle-kit push` directly and never pass through this file.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "db",
  "postgres",
]);
const OVERRIDE = "ALLOW_NON_LOCAL_SERVICES";
const LIVE_KEY = /^(sk|rk|pk)_live_/;

export type Check = "db" | "stripe" | "email";
/** A reason a run must be refused. */
export type Violation = string;
type Env = Record<string, string | undefined>;

const hostOf = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return null;
  }
};

/** Returns the reasons a run must be refused; empty means go ahead. */
export function violations(
  env: Env,
  checks: Check[] = ["db", "stripe", "email"],
): Violation[] {
  const problems: Violation[] = [];
  const overridden = env[OVERRIDE] === "1";

  if (checks.includes("db") && env.DATABASE_URL && !overridden) {
    const host = hostOf(env.DATABASE_URL);
    if (!host || !LOCAL_HOSTS.has(host)) {
      problems.push(
        `DATABASE_URL points at "${host ?? "an unparseable URL"}", not a local database.`,
      );
    }
  }

  if (checks.includes("stripe") && env.NODE_ENV !== "production") {
    for (const name of [
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    ]) {
      if (LIVE_KEY.test(env[name] ?? "")) {
        problems.push(`${name} is a live Stripe key. Use a test-mode key.`);
      }
    }
  }

  if (checks.includes("email") && env.EMAIL_SERVER_HOST && !overridden) {
    const host = env.EMAIL_SERVER_HOST.toLowerCase();
    if (!LOCAL_HOSTS.has(host) && host !== "mailpit") {
      problems.push(
        `EMAIL_SERVER_HOST is "${host}". Local runs send to Mailpit on localhost.`,
      );
    }
  }

  return problems;
}

// Minimal KEY=VALUE reader for an env file; a variable already in the
// environment wins, as with dotenv.
function readEnvFile(file: string): Env {
  if (!existsSync(file)) return {};
  const out: Env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!match) continue;
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const flags = process.argv
    .slice(2)
    .map((arg) => arg.replace(/^--/, "")) as Check[];
  // Each env file is checked on its own, never merged: drizzle and the seeds
  // read the root .env while Next.js reads the web app's files, so a local
  // value in one must not hide a hosted one in another.
  const web = resolve(root, "sites/mainweb");
  const sources = [
    resolve(root, ".env"),
    resolve(web, ".env"),
    resolve(web, ".env.local"),
  ].map((file) => ({ ...readEnvFile(file), ...process.env }));
  const problems = [
    ...new Set(
      sources.flatMap((env) =>
        violations(env, flags.length ? flags : undefined),
      ),
    ),
  ];

  if (problems.length) {
    console.error(
      "Refusing to run: this looks like it could reach production.",
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    if (problems.some((problem) => !problem.includes("Stripe"))) {
      console.error(
        `Point DATABASE_URL at the local compose database (pnpm local:up), or set ${OVERRIDE}=1 if you really mean it.`,
      );
    }
    process.exit(1);
  }
}
