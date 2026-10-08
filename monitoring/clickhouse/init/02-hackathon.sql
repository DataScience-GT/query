-- Hackathon history. Same reason as the payment tables: aggregate it here,
-- not on the 0.5 GB application database. `export:clickhouse` creates these
-- too, so a volume that already ran 01-schema.sql still picks them up.

CREATE DATABASE IF NOT EXISTS dsgt;

CREATE TABLE IF NOT EXISTS dsgt.hackathon_registrations
(
    id            String,
    hackathon     String,
    status        LowCardinality(String),
    registered_at DateTime64(3),
    updated_at    DateTime64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (hackathon, id);

CREATE TABLE IF NOT EXISTS dsgt.hackathon_projects
(
    id           String,
    hackathon    String,
    status       LowCardinality(String),
    submitted_at Nullable(DateTime64(3)),
    updated_at   DateTime64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (hackathon, id);

CREATE TABLE IF NOT EXISTS dsgt.hackathon_scans
(
    id            String,
    hackathon     String,
    event_name    String,
    checked_in_at DateTime64(3)
)
ENGINE = ReplacingMergeTree(checked_in_at)
ORDER BY (hackathon, id);

CREATE TABLE IF NOT EXISTS dsgt.hackathon_votes
(
    id         String,
    hackathon  String,
    score      Int32,
    voted_at   DateTime64(3),
    updated_at DateTime64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (hackathon, id);

CREATE VIEW IF NOT EXISTS dsgt.hackathon_registrations_by_status AS
SELECT
    hackathon,
    status,
    count() AS registrations
FROM dsgt.hackathon_registrations FINAL
GROUP BY hackathon, status
ORDER BY hackathon, status;
