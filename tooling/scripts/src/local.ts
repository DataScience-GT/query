/**
 * One entry point for the local test environment.
 *
 *   pnpm local:up       env files, containers, schema, seed data
 *   pnpm local:down     stop the containers, keep the data
 *   pnpm local:reset    stop them and delete the data (next local:up starts clean)
 *
 * See docker-compose.local.yml and docs/getting-started.md.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const compose = ["docker", "compose", "-f", "docker-compose.local.yml"];

function run(command: string[]) {
  // One command string: passing args alongside shell: true is deprecated, and
  // the shell is what finds pnpm.cmd on Windows.
  const { status } = spawnSync(command.join(" "), {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (status !== 0) process.exit(status ?? 1);
}

// Next.js reads sites/mainweb/.env.local, drizzle and the seed read the root
// .env. Existing files are never overwritten.
function ensureEnvFiles() {
  for (const target of [".env", "sites/mainweb/.env.local"]) {
    if (existsSync(resolve(root, target))) continue;
    copyFileSync(resolve(root, ".env.example"), resolve(root, target));
    console.log(`Created ${target} from .env.example`);
  }
}

const command = process.argv[2];

if (command === "up") {
  ensureEnvFiles();
  // Before anything starts: a .env that points at a hosted database stops here.
  run(["node", "tooling/scripts/src/guard-local.ts"]);
  run([...compose, "up", "-d", "--wait"]);
  run(["pnpm", "--filter", "@query/db", "migrate:push"]);
  run(["pnpm", "--filter", "@query/db", "db:seed"]);
  console.log(`
Local environment is up.
  pnpm dev                web on http://localhost:3001
  Mailpit inbox           http://localhost:8025  (sign-in codes land here)
  Sign in as              admin@example.test
`);
} else if (command === "down" || command === "reset") {
  run([...compose, "down", ...(command === "reset" ? ["--volumes"] : [])]);
} else {
  console.error("Usage: node tooling/scripts/src/local.ts up|down|reset");
  process.exit(1);
}
