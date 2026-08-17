/**
 * Copies payment and membership history from Postgres into ClickHouse.
 *
 *   pnpm --filter @query/db export:clickhouse
 *
 * Read-only against Postgres — it runs two SELECTs and writes nothing back.
 * That is deliberate: the application database is a 0.5 GB Neon instance, so
 * history that exists to be aggregated belongs somewhere that is not it.
 *
 * Safe to re-run. Both ClickHouse tables are ReplacingMergeTree keyed on the
 * row id, so a second run replaces rows rather than duplicating them, and the
 * whole thing can go on a cron without any watermark bookkeeping.
 *
 * Env:
 *   DATABASE_URL     Postgres to read from. Prod is fine — nothing is written.
 *   CLICKHOUSE_URL   default http://localhost:8123
 *   CLICKHOUSE_USER  default dsgt
 *   CLICKHOUSE_PASSWORD default dsgt
 *   CLICKHOUSE_DB    default dsgt
 */
import { Pool } from "pg";

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

const readJson = (raw: string | null) => {
  if (!raw) return {} as Record<string, string>;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
};

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

try {
  const payments = await pool.query<{
    id: string;
    created_at: Date;
    updated_at: Date | null;
    amount_total: number | null;
    currency: string | null;
    payment_status: string;
    metadata: string | null;
    linked_user_id: string | null;
    customer_email: string;
  }>(
    `select id, created_at, updated_at, amount_total, currency,
            payment_status, metadata, linked_user_id, customer_email
       from "stripe_payment"`,
  );

  const paymentRows = payments.rows.map((row) => {
    const meta = readJson(row.metadata);
    return {
      id: row.id,
      created_at: stamp(row.created_at),
      updated_at: stamp(row.updated_at ?? row.created_at),
      amount_cents: row.amount_total ?? 0,
      currency: row.currency ?? "usd",
      payment_status: row.payment_status,
      // Rows written before the plan existed bought the only thing on offer.
      plan: meta.plan === "semester" ? "semester" : "annual",
      bootcamp: meta.bootcamp === "true" ? 1 : 0,
      addon_only: meta.type === "bootcamp_addon" ? 1 : 0,
      linked: row.linked_user_id ? 1 : 0,
      customer_email: row.customer_email,
    };
  });

  const history = await pool.query<{
    id: string;
    member_id: string;
    action: string;
    start_date: Date | null;
    end_date: Date | null;
    created_at: Date;
  }>(
    `select id, member_id, action, start_date, end_date, created_at
       from "membership_history"`,
  );

  const DAY_MS = 24 * 60 * 60 * 1000;
  const historyRows = history.rows.map((row) => ({
    id: row.id,
    member_id: row.member_id,
    action: row.action,
    start_date: stamp(row.start_date),
    end_date: stamp(row.end_date),
    created_at: stamp(row.created_at),
    term_days:
      row.start_date && row.end_date
        ? Math.round(
            (row.end_date.getTime() - row.start_date.getTime()) / DAY_MS,
          )
        : 0,
  }));

  const written =
    (await insert("payments", paymentRows)) +
    (await insert("membership_events", historyRows));

  console.log(
    `Exported ${paymentRows.length} payments and ${historyRows.length} membership events (${written} rows).`,
  );
} catch (error) {
  console.error("Export failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
