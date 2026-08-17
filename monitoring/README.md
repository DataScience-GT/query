# Monitoring

Prometheus, Grafana and ClickHouse, behind a compose profile. Nothing here runs
unless you ask for it, and nothing here writes to Postgres.

```bash
docker compose --profile monitoring up -d
pnpm dev                      # the scrape target is next dev on the host
```

| What | Where | Login |
| --- | --- | --- |
| Grafana | http://localhost:3002 | admin / admin (anonymous viewing is on) |
| Prometheus | http://localhost:9090 | — |
| ClickHouse | http://localhost:8123 | dsgt / dsgt |
| Metrics endpoint | http://localhost:3001/api/metrics | — |

Grafana is on 3002 because mainweb's `next dev` binds 3001.

The "DSGT Portal" dashboard is provisioned from
`grafana/dashboards/dsgt-portal.json`. Edits made in the Grafana UI are
overwritten on the next scan — change the JSON.

## The 0.5 GB database

Neon is capped at 0.5 GB, so none of this stores anything there. Prometheus
keeps its series in the `promdata` volume (15-day retention), ClickHouse in
`chdata`. The only contact with Postgres is a handful of `count(*)` reads on
the metrics endpoint, behind a 60-second cache — at a 30-second scrape interval
that is at most one round of counts a minute.

If disk on your machine matters, `docker compose down -v` removes the volumes.

## Which numbers to believe in production

Production runs on Firebase App Hosting: instances autoscale and are discarded.
That splits the metrics in two.

**Trustworthy anywhere** — recomputed from the database on each scrape, so the
number of instances is irrelevant:

- `dsgt_members_active`, `dsgt_members_lapsed`
- `dsgt_bootcamp_enrolled{term}`
- `dsgt_payments_by_plan{plan}` — the yearly/semester split
- `dsgt_payments_unlinked` — paid, claimed by nobody. This is **not** zero and
  is not supposed to be: as of August 2026 it sits around 428 of 443 paid rows,
  nearly all from the August–September 2025 and January 2026 drives. Those are
  people who paid through Stripe and have not signed into the portal since; the
  link paths claim their payment the moment they do. Watch the 24-hour change,
  not the total — that is what the alert does.

**A sample, in production** — in-process counters and histograms. Each scrape
reads one arbitrary instance, and a scale-down throws its numbers away:

- `dsgt_payment_intents_total`, `dsgt_membership_grants_total`
- `dsgt_membership_grant_failures_total`, `dsgt_payments_recovered_total`
- `dsgt_trpc_duration_seconds`, and everything `dsgt_process_*` / `dsgt_nodejs_*`

Locally, where one `next dev` process serves everything, they are exact. In
production read them as "this happened at least this often" — a non-zero grant
failure count is still worth acting on, the exact total is not.

## Scraping production

1. Set `METRICS_TOKEN` on the deployment. Without it the route returns 404 in
   production — it fails closed rather than serving counts to anyone who asks.
2. Write the same value to `monitoring/secrets/metrics-token` (gitignored, no
   trailing newline).
3. Uncomment the `mainweb-prod` job in `prometheus.yml` and set the hostname.
4. `docker compose --profile monitoring restart prometheus`.

Your laptop has to be running for prod scrapes to land. If you want history that
survives closing it, point the same job at a hosted Prometheus (Grafana Cloud's
free tier takes remote-write) instead of this container.

## Alerts

`rules/payments.yml` is evaluated by Prometheus and shows at
http://localhost:9090/alerts. There is **no Alertmanager in this stack**, so
nothing routes a firing alert anywhere on its own — you have to look, or add
one.

The alerts that matter:

- `MembershipGrantFailing` — a payment was recorded and the membership was not.
- `UnlinkedPaymentsClimbing` — the link paths are not claiming payments.
- `ReconcileRecoveringOften` — the backstop is carrying the fast path.

To route them into ClickUp, run Alertmanager with a webhook receiver and pipe
its payload to `node scripts/clickup-task.mjs --stdin`. That step is not built
here.

## ClickHouse

For history you want to aggregate without paying for it in Neon. Schema in
`clickhouse/init/01-schema.sql`, applied on first boot of an empty volume.

```bash
CLICKHOUSE_URL=http://localhost:8123 pnpm --filter @query/db export:clickhouse
```

Reads Postgres, writes ClickHouse, and is safe against production `DATABASE_URL`
— it only SELECTs. Both tables are `ReplacingMergeTree` keyed on row id, so
re-running replaces rather than duplicates; put it on a daily cron if you want.

`dsgt.plan_mix_monthly` answers the question the $15 plan was added to test:

```sql
SELECT * FROM dsgt.plan_mix_monthly;
```

## ClickUp

`scripts/clickup-task.mjs` files a task from the command line:

```bash
CLICKUP_TOKEN=pk_… CLICKUP_LIST_ID=901… \
  node scripts/clickup-task.mjs "Bootcamp schedule still unset" "Room, time and Deepnote URL are null"
```

Deliberately a script and not a route on the site: an inbound endpoint that
creates tasks on an unauthenticated POST is a way for anyone who finds it to
fill the workspace with junk.
