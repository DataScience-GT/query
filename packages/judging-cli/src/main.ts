import {
  appliedMigrations,
  createDb,
  migrate,
  migrationFiles,
  databaseUrl,
  requireDatabaseUrl,
  seedDemo,
} from "@query/judging-db";
import { drainOutbox } from "@query/judging-server/outbox";
import { exportResults, importProjects } from "./transfer";

const [command, arg] = process.argv.slice(2);

async function main() {
  if (command === "import" && arg === "projects") {
    const positionals = positionalsAfter(4);
    const file = positionals[0];
    const eventId = positionals[1];
    const mapFile = option("--map");
    if (!file || !eventId) {
      console.log("usage: panel import projects <csv> <eventId> [--map columns.yaml]");
      process.exit(1);
    }
    const count = await importProjects(file, eventId, mapFile);
    console.log(count);
    return;
  }

  if (command === "export" && arg === "results") {
    const format = option("--format") === "json" ? "json" : "csv";
    const positionals = positionalsAfter(4);
    const eventId = positionals[0];
    const file = positionals[1] ?? (format === "json" ? "results.json" : "results.csv");
    if (!eventId) {
      console.log("usage: panel export results <eventId> [file] [--format csv|json]");
      process.exit(1);
    }
    const count = await exportResults(eventId, file, format);
    console.log(count);
    return;
  }

  if (command === "migrate") {
    const { pool } = createDb(requireDatabaseUrl());
    const fresh = await migrate(pool);
    console.log(fresh.length > 0 ? fresh.join("\n") : "up to date");
    await pool.end();
    return;
  }

  if (command === "seed" && arg === "demo") {
    const { db, pool } = createDb(requireDatabaseUrl());
    await migrate(pool);
    const seeded = await seedDemo(db);
    console.log(seeded.eventId);
    await pool.end();
    return;
  }

  if (command === "outbox" && arg === "drain") {
    const { db, pool } = createDb(requireDatabaseUrl());
    let total = 0;
    try {
      for (;;) {
        const delivered = await drainOutbox(db);
        total += delivered;
        if (delivered === 0) break;
      }
    } finally {
      await pool.end();
    }
    console.log(total);
    return;
  }

  if (command === "doctor") {
    const checks: { name: string; ok: boolean; detail: string }[] = [];
    const url = databaseUrl();
    if (!url) {
      checks.push({
        name: "postgres",
        ok: false,
        detail: "DATABASE_URL is not set",
      });
    } else {
      const { pool } = createDb(url);
      try {
        await pool.query("select 1");
        checks.push({ name: "postgres", ok: true, detail: "connected" });
        const files = await migrationFiles();
        const applied = await appliedMigrations(pool);
        const pending = files.filter((file) => !applied.includes(file));
        checks.push({
          name: "migrations",
          ok: pending.length === 0,
          detail: pending.length > 0 ? `pending ${pending.join(", ")}` : "up to date",
        });
      } catch (error) {
        checks.push({
          name: "postgres",
          ok: false,
          detail: error instanceof Error ? error.message : "connection failed",
        });
      } finally {
        await pool.end();
      }
    }

    const secret = process.env.PANEL_JWT_SECRET;
    checks.push({
      name: "jwt",
      ok: Boolean(secret),
      detail: secret ? "PANEL_JWT_SECRET is set" : "PANEL_JWT_SECRET is not set",
    });
    checks.push({
      name: "redis",
      ok: true,
      detail: process.env.REDIS_URL ? "REDIS_URL is set" : "not configured",
    });

    for (const check of checks) {
      console.log(`${check.ok ? "ok" : "fail"}  ${check.name}  ${check.detail}`);
    }
    if (checks.some((check) => !check.ok)) process.exit(1);
    return;
  }

  console.log(
    "usage: panel migrate | panel seed demo | panel doctor | panel outbox drain | panel import projects <csv> <eventId> | panel export results <eventId> [file]",
  );
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function positionalsAfter(start: number): string[] {
  const args = process.argv.slice(start);
  return args.filter((value, index) => {
    if (value.startsWith("--")) return false;
    const previous = args[index - 1];
    return previous !== "--format" && previous !== "--map";
  });
}
