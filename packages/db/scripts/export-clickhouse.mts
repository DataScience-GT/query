/**
 * Copies payment, membership, and hackathon history from Postgres into ClickHouse.
 *
 *   pnpm --filter @query/db export:clickhouse
 *
 * Read-only against Postgres — it runs SELECTs and writes nothing back.
 * That is deliberate: the application database is a 0.5 GB Neon instance, so
 * history that exists to be aggregated belongs somewhere that is not it.
 *
 * Safe to re-run. The ClickHouse tables are ReplacingMergeTree keyed on the
 * row id, so a second run replaces rows rather than duplicating them, and the
 * whole thing can go on a cron without any watermark bookkeeping.
 *
 * Hackathon rows are ids, edition names, and statuses. Names and emails stay
 * in Postgres.
 *
 * Env:
 *   DATABASE_URL     Postgres to read from. Prod is fine — nothing is written.
 *   CLICKHOUSE_URL   default http://localhost:8123
 *   CLICKHOUSE_USER  default dsgt
 *   CLICKHOUSE_PASSWORD default dsgt
 *   CLICKHOUSE_DB    default dsgt
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import {
  hackathonEventAttendees,
  hackathonEvents,
  hackathonParticipants,
  hackathonProjects,
  hackathons,
  judgeVotes,
  judgingProjects,
  membershipHistory,
  stripePayments,
} from "../src/schemas";

const {
  DATABASE_URL,
  CLICKHOUSE_URL = "http://localhost:8123",
  CLICKHOUSE_USER = "dsgt",
  CLICKHOUSE_PASSWORD = "dsgt",
  CLICKHOUSE_DB = "dsgt",
} = process.env;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/** Rows go over the HTTP interface as JSONEachRow — no client library needed. */
async function insert(table: string, rows: unknown[]) {
  if (rows.length === 0) return 0;

  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  const query = `INSERT INTO ${CLICKHOUSE_DB}.${table} FORMAT JSONEachRow`;
  const url = `${CLICKHOUSE_URL}/?query=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-ClickHouse-User": CLICKHOUSE_USER,
      "X-ClickHouse-Key": CLICKHOUSE_PASSWORD,
      "content-type": "text/plain",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(
      `ClickHouse rejected the insert into ${table}: ${res.status} ${await res.text()}`,
    );
  }

  return rows.length;
}

/** ClickHouse DateTime64 wants `YYYY-MM-DD hh:mm:ss.mmm`, not an ISO `T`/`Z`. */
const stamp = (value: Date | null | undefined) =>
  (value ?? new Date(0)).toISOString().replace("T", " ").replace("Z", "");

const stampOrNull = (value: Date | null | undefined) =>
  value ? stamp(value) : null;

/** Applies monitoring/clickhouse/init/02-hackathon.sql. Init only runs on an empty volume. */
async function ensureHackathonTables() {
  const file = fileURLToPath(
    new URL(
      "../../../monitoring/clickhouse/init/02-hackathon.sql",
      import.meta.url,
    ),
  );
  const statements = readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    const url = `${CLICKHOUSE_URL}/?query=${encodeURIComponent(statement)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": CLICKHOUSE_USER,
        "X-ClickHouse-Key": CLICKHOUSE_PASSWORD,
      },
    });
    if (!res.ok) {
      throw new Error(
        `ClickHouse rejected schema setup: ${res.status} ${await res.text()}`,
      );
    }
  }
}

const readJson = (raw: string | null) => {
  if (!raw) return {} as Record<string, string>;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
};

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const db = drizzle(pool);

try {
  await ensureHackathonTables();
  const payments = await db
    .select({
      id: stripePayments.id,
      createdAt: stripePayments.createdAt,
      updatedAt: stripePayments.updatedAt,
      amountTotal: stripePayments.amountTotal,
      currency: stripePayments.currency,
      paymentStatus: stripePayments.paymentStatus,
      metadata: stripePayments.metadata,
      linkedUserId: stripePayments.linkedUserId,
      customerEmail: stripePayments.customerEmail,
    })
    .from(stripePayments);

  const paymentRows = payments.map((row) => {
    const meta = readJson(row.metadata);
    return {
      id: row.id,
      created_at: stamp(row.createdAt),
      updated_at: stamp(row.updatedAt ?? row.createdAt),
      amount_cents: row.amountTotal ?? 0,
      currency: row.currency ?? "usd",
      payment_status: row.paymentStatus,
      // Rows written before the plan existed bought the only thing on offer.
      plan: meta.plan === "semester" ? "semester" : "annual",
      bootcamp: meta.bootcamp === "true" ? 1 : 0,
      addon_only: meta.type === "bootcamp_addon" ? 1 : 0,
      linked: row.linkedUserId ? 1 : 0,
      customer_email: row.customerEmail,
    };
  });

  const history = await db
    .select({
      id: membershipHistory.id,
      memberId: membershipHistory.memberId,
      action: membershipHistory.action,
      startDate: membershipHistory.startDate,
      endDate: membershipHistory.endDate,
      createdAt: membershipHistory.createdAt,
    })
    .from(membershipHistory);

  const DAY_MS = 24 * 60 * 60 * 1000;
  const historyRows = history.map((row) => ({
    id: row.id,
    member_id: row.memberId,
    action: row.action,
    start_date: stamp(row.startDate),
    end_date: stamp(row.endDate),
    created_at: stamp(row.createdAt),
    term_days:
      row.startDate && row.endDate
        ? Math.round(
            (row.endDate.getTime() - row.startDate.getTime()) / DAY_MS,
          )
        : 0,
  }));

  const registrations = await db
    .select({
      id: hackathonParticipants.id,
      hackathon: hackathons.name,
      status: hackathonParticipants.registrationStatus,
      registeredAt: hackathonParticipants.registeredAt,
      updatedAt: hackathonParticipants.updatedAt,
    })
    .from(hackathonParticipants)
    .innerJoin(
      hackathons,
      eq(hackathons.id, hackathonParticipants.hackathonId),
    );

  const registrationRows = registrations.map((row) => ({
    id: row.id,
    hackathon: row.hackathon,
    status: row.status,
    registered_at: stamp(row.registeredAt),
    updated_at: stamp(row.updatedAt),
  }));

  const projects = await db
    .select({
      id: hackathonProjects.id,
      hackathon: hackathons.name,
      status: hackathonProjects.status,
      submittedAt: hackathonProjects.submittedAt,
      updatedAt: hackathonProjects.updatedAt,
    })
    .from(hackathonProjects)
    .innerJoin(hackathons, eq(hackathons.id, hackathonProjects.hackathonId));

  const projectRows = projects.map((row) => ({
    id: row.id,
    hackathon: row.hackathon,
    status: row.status,
    submitted_at: stampOrNull(row.submittedAt),
    updated_at: stamp(row.updatedAt),
  }));

  const scans = await db
    .select({
      id: hackathonEventAttendees.id,
      hackathon: hackathons.name,
      eventName: hackathonEvents.name,
      checkedInAt: hackathonEventAttendees.checkedInAt,
    })
    .from(hackathonEventAttendees)
    .innerJoin(
      hackathonEvents,
      eq(hackathonEvents.id, hackathonEventAttendees.eventId),
    )
    .innerJoin(hackathons, eq(hackathons.id, hackathonEvents.hackathonId));

  const scanRows = scans.map((row) => ({
    id: row.id,
    hackathon: row.hackathon,
    event_name: row.eventName,
    checked_in_at: stamp(row.checkedInAt),
  }));

  const votes = await db
    .select({
      id: judgeVotes.id,
      hackathon: hackathons.name,
      score: judgeVotes.score,
      votedAt: judgeVotes.votedAt,
      updatedAt: judgeVotes.updatedAt,
    })
    .from(judgeVotes)
    .innerJoin(judgingProjects, eq(judgingProjects.id, judgeVotes.projectId))
    .innerJoin(hackathons, eq(hackathons.id, judgingProjects.hackathonId));

  const voteRows = votes.map((row) => ({
    id: row.id,
    hackathon: row.hackathon,
    score: row.score,
    voted_at: stamp(row.votedAt),
    updated_at: stamp(row.updatedAt),
  }));

  const written =
    (await insert("payments", paymentRows)) +
    (await insert("membership_events", historyRows)) +
    (await insert("hackathon_registrations", registrationRows)) +
    (await insert("hackathon_projects", projectRows)) +
    (await insert("hackathon_scans", scanRows)) +
    (await insert("hackathon_votes", voteRows));

  console.log(
    `Exported ${paymentRows.length} payments, ${historyRows.length} membership events, ${registrationRows.length} registrations, ${projectRows.length} projects, ${scanRows.length} scans, and ${voteRows.length} votes (${written} rows).`,
  );
} catch (error) {
  console.error("Export failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
