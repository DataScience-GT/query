-- Analytics store for payment and membership history.
--
-- Why this exists at all: the application database is a 0.5 GB Neon instance
-- and is sized for operating the club, not for keeping years of history to run
-- aggregate queries over. This holds the copy you can query freely without
-- putting load on, or bytes into, the database the site runs on.
--
-- Nothing writes here from the request path. `pnpm --filter @query/db
-- export:clickhouse` copies rows across; see monitoring/README.md.

CREATE DATABASE IF NOT EXISTS dsgt;

-- ReplacingMergeTree keyed on the payment id, so re-running the export is
-- idempotent: a row that already exists is replaced rather than duplicated.
-- `updated_at` breaks ties, so the newest copy of a row wins a merge.
CREATE TABLE IF NOT EXISTS dsgt.payments
(
    id              String,
    created_at      DateTime64(3),
    updated_at      DateTime64(3),
    amount_cents    Int32,
    currency        LowCardinality(String),
    payment_status  LowCardinality(String),
    plan            LowCardinality(String),
    bootcamp        UInt8,
    addon_only      UInt8,
    linked          UInt8,
    customer_email  String
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (created_at, id);

-- One row per membership term ever sold, from membership_history.
CREATE TABLE IF NOT EXISTS dsgt.membership_events
(
    id          String,
    member_id   String,
    action      LowCardinality(String),
    start_date  DateTime64(3),
    end_date    DateTime64(3),
    created_at  DateTime64(3),
    -- Derived, not stored upstream: a term of roughly a year is the annual
    -- plan, anything materially shorter is a semester. The plan itself lives on
    -- the payment, so this is the best a history row can say on its own.
    term_days   Int32
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (created_at, id);

-- Convenience view: what did we sell, by month and plan.
CREATE VIEW IF NOT EXISTS dsgt.plan_mix_monthly AS
SELECT
    toStartOfMonth(created_at) AS month,
    plan,
    bootcamp,
    count()                    AS payments,
    sum(amount_cents) / 100.0  AS dollars
FROM dsgt.payments
WHERE payment_status = 'paid'
GROUP BY month, plan, bootcamp
ORDER BY month DESC, plan;
