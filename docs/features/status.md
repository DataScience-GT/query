# Status page, metrics and latency

Two things share the word status. The public `/status` page shows uptime and latency recorded from real traffic, for anyone. The Prometheus metrics endpoint, the alert rules and the Grafana dashboard are the deeper view officers and developers use to see whether dues are being granted and whether the API is slow. This page covers both.

Running the monitoring stack locally and scraping production is in the repo's `monitoring/README.md`. Payment-specific counters are explained in [Payments](./payments.md).

## The `/status` page

`/status` shows whether the site is up, how fast it is, and 90 days of uptime history. The traffic numbers are read from Postgres; an external probe adds an outside view (see [The external probe](#the-external-probe)). The page is revalidated every 300 seconds (`export const revalidate = 300`), matching the five-minute bucket size. A regeneration runs the live `select 1` and one query for the last 24 hours. The 90 days of finished UTC days come from a second query wrapped in `unstable_cache` (6 hour revalidate, key includes the current UTC day, so it rolls over at midnight); a failed query is not cached. Today's bar is computed from the 24 hour rows by `dayFromBuckets` in `lib/status.ts`. The cached days can miss a bucket that is flushed after the cache entry was filled, up to about 6 hours.

### Where the numbers come from

There is no background worker in the app. Every tRPC procedure is already timed by the `recordDuration` middleware in `packages/api/src/trpc.ts`; the same middleware feeds `packages/api/src/services/status-samples.ts`, which counts each call into an in-process five-minute bucket (requests, server errors, a bounded sample of durations for p50 and p95).

The first call that lands in a later bucket writes the finished bucket to `status_sample` and returns without waiting. The write is an upsert keyed on bucket and instance; a retry replaces the row, so a write that landed but lost its reply is not counted twice. It runs `select 1` and stores whether it answered and how long it took. A failed write is retried with the next flush (up to 12 buckets, then dropped) and counted in `dsgt_status_sample_write_failures_total`. The first flush after a process starts, and then once a day, the same code deletes rows older than 90 days.

Consequences, stated plainly:

- A quiet period has no rows. The page shows it as no data, never as down.
- The newest bucket appears about five minutes late, and an instance that scales down loses the bucket it had open.
- Only tRPC traffic is counted. Pages served without an API call are not.
- A database that is fully down cannot store its own outage. The live check on the page (a `select 1` at render time) and the retried bucket's saved ping cover that.

### The external probe

The sampled numbers have a blind spot: no traffic means no data, and the app cannot see itself being unreachable. A GitHub Actions workflow, `.github/workflows/uptime.yml`, covers that from outside. The repo is public, so the minutes are free.

- Every 5 minutes (`cron: "*/5 * * * *"`, also `workflow_dispatch`) it runs `tooling/scripts/src/uptime-probe.ts`: plain Node, no install step. The script requests `https://datasciencegt.org/api/ping` up to 3 times with a 10 second timeout each. A non-2xx answer or a timeout is a failed attempt. It records the status code and latency of the first success, or of the last failure (`code` 0 means no answer).
- `/api/ping` (`app/api/ping/route.ts`) returns `{ ok: true }` with `cache-control: no-store` and touches nothing else. It deliberately never reaches the database: Neon bills compute while awake and suspends after about 5 idle minutes, so a probe that ran a query would keep it awake 24 hours a day. It is not a tRPC route, so it does not count as traffic in `status_sample`, and `proxy.ts` only sets headers on it.
- The result goes to `uptime.json` on the `status-data` branch. Every run builds a new orphan commit and force-pushes it, so the branch is always exactly one commit and the repository does not grow. The workflow uses the `github-actions[bot]` identity and only needs `contents: write`.
- The same run records the latest `main` commit (SHA, commit time) and the conclusion of its `App Hosting - Rollout` check run as `deploy`, using the workflow token. The site never calls the GitHub API; a failed lookup keeps the previous value.
- `/status` fetches `raw.githubusercontent.com/.../status-data/uptime.json` on the server (`app/status/uptime.ts`, `revalidate: 300`, 3 second timeout). If the fetch or the parse fails, the outside sections are left out and the page renders from the database alone.

`uptime.json`, version 1, bounded:

| Field | Meaning |
| --- | --- |
| `updatedAt` | Epoch ms of the last run |
| `recent` | Probes from the last 24 hours (about 288, capped at 400): `{ t, ok, ms, code }` |
| `days` | Up to 90 UTC days of probes older than 24 hours: `{ day, probes, up, worstMs }` |
| `deploy` | `{ sha, committedAt, rollout }` for the newest `main` commit |

Rolling `recent` into `days` is the pure function `applyProbe` in the script, tested in `tooling/scripts/src/uptime-probe.test.ts`. The read side (windows, stale and down rules) is `sites/mainweb/lib/uptime.ts`, tested in `lib/uptime.test.ts`.

How the headline uses it:

- **Down**: the last 2 probes both failed. This overrides the database view. One failed probe is not enough; it already retried 3 times, and a single miss can be the network between GitHub and the site.
- **Stale**: the newest probe is older than 30 minutes. The page says the outside check is stale and claims nothing from it, even if the old probes failed. Stale beats Down.
- Otherwise the probe changes nothing and the headline stays the database-derived one.

GitHub cron is best effort. Scheduled runs often start 5 to 15 minutes late, can be skipped under load, and a repository with no activity for 60 days has its schedules disabled. That is why staleness is shown instead of assumed away, and why 30 minutes, not 5, is the stale threshold.

The page shows a separate 90 day strip for the outside check (not merged with the traffic strip, because the two measure different things), with 24 hour, 30 day and 90 day uptime, the last probe time and latency, and a deploy line (short SHA linked to the commit, commit time, rollout result). Windows are probes that passed over probes made; days are UTC.

After merge the maintainers must: allow the workflow to write (Settings, Actions, General, Workflow permissions: read and write, or leave the default and rely on the `permissions` block), and make sure no branch protection rule or ruleset blocks force pushes to `status-data`. Run the workflow once with `workflow_dispatch` to create the branch. Until it exists `/status` simply omits the outside sections.

### Table

`status_sample` (`packages/db/src/schemas/status.ts`), pushed with `drizzle-kit push`. One row per five-minute bucket per instance; primary key `(bucket_start, instance_id)`; `instance_id` is random per process.

| Column             | Meaning                                             |
| ------------------ | --------------------------------------------------- |
| `bucket_start`     | Start of the five-minute bucket, UTC, `timestamptz` |
| `requests`         | tRPC calls in the bucket                            |
| `errors`           | Server errors only                                  |
| `p50_ms`, `p95_ms` | From a bounded in-process sample (500 durations)    |
| `db_ok`, `db_ms`   | `select 1` taken when the bucket was written        |

Aggregates only. No user, route or request detail is stored.

### What counts as an error

Procedures that ended in `INTERNAL_SERVER_ERROR`, `NOT_IMPLEMENTED`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE` or `GATEWAY_TIMEOUT`. Client errors (`UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`, `NOT_FOUND`, `TOO_MANY_REQUESTS` and so on) are not downtime and are not counted.

### Uptime rule

Instances are summed per bucket first. A five-minute bucket is **up** when every instance's `db_ok` is true and `errors / requests` is under 5%. Uptime % is up minutes divided by minutes with data. The rule lives in `sites/mainweb/lib/status.ts` and is tested in `lib/status.test.ts`.

### Current status

Derived from the live check and the last 15 minutes of buckets:

- **Down**: the live `select 1` failed, or at least half of the requests in the last 15 minutes were server errors.
- **Degraded**: a bucket in the last 15 minutes broke the uptime rule, or the live ping took over 1 second.
- **Operational**: anything else, including when there is no recent traffic.

### What the page shows

The status headline with the reason, 90 day and 30 day uptime, a 90 day strip with one bar per UTC day (colour by uptime: 99% or better, 95 to 99%, under 95%, gray for no data, with a tooltip and a table view), a 24 hour p95 latency chart (slowest instance per bucket) and a 24 hour requests and errors chart. Times are Eastern. The loader is `sites/mainweb/app/status/load.ts`; each query has a 3 second deadline, and if the database is asleep or stalled the page renders Down with empty charts rather than failing. An open tab refreshes itself every 5 minutes while visible, and on return to the tab if the last refresh was 5 minutes ago or more (`AutoRefresh.tsx`).

## Metrics endpoint

`GET /api/metrics`, from `sites/mainweb/app/(portal)/api/metrics/route.ts`. Node runtime, never cached (`force-dynamic`).

| Environment | Auth |
| --- | --- |
| Production | `METRICS_TOKEN` is mandatory. The request must send `Authorization: Bearer <token>`. Without a match, or with no token configured, the route returns **404**, not 401, so it does not advertise itself |
| Development | Open if `METRICS_TOKEN` is unset |

The route calls `refreshDbGauges(db)` and returns `registry.metrics()` as Prometheus text with `cache-control: no-store`. Nothing writes to the database.

```mermaid
flowchart LR
  A["Any tRPC call"] --> B["recordDuration middleware<br/>dsgt_trpc_duration_seconds"]
  C["Stripe grant paths"] --> D["Counters in the registry"]
  B --> E["prom-client registry<br/>in process memory"]
  D --> E
  F["Prometheus scrape every 30s<br/>GET /api/metrics with Bearer token"] --> G["refreshDbGauges<br/>count queries, 60s cache"]
  G --> E
  E --> H["Prometheus text response"]
  H --> I["Rules: alerts and p99 recordings"]
  H --> J["Grafana dashboard DSGT Portal"]
```

## Two kinds of number

Production runs several instances that autoscale and get discarded. That splits the metrics in two. All names are prefixed `dsgt_` (`packages/api/src/services/metrics.ts`).

**Recomputed from the database on each refresh. Correct on any instance.** `refreshDbGauges` runs a handful of `count` queries at most once every 60 seconds per instance (`GAUGE_TTL_MS`), and a failure only increments `dsgt_metrics_refresh_failures_total`.

| Metric | Meaning |
| --- | --- |
| `dsgt_members_active`, `dsgt_members_lapsed` | Paid term not ended, and term ended |
| `dsgt_bootcamp_enrolled{term}` | Members whose `bootcamp_term` is the current term |
| `dsgt_payments_by_plan{plan}` | Paid payments by plan in their metadata |
| `dsgt_payments_unlinked` | Paid, claimed by nobody |
| `dsgt_resumes_stored`, `dsgt_resume_bytes_stored` | Resume book size |
| `dsgt_hackathon_participants{edition,phase,status}` | Registrations per live edition |
| `dsgt_hackathon_projects`, `_checkins_today`, `_judging_projects`, `_votes`, `_judging_active` | Per live edition. Live means status `open`, `closed` or `in_progress`; a finished edition drops out on the next refresh. Check-ins are hackathon badge scans since midnight Eastern, not club door check-ins |

`dsgt_payments_unlinked` is not zero and is not meant to be: most paid rows are people who paid through Stripe and have not signed in since, and the sign-in link claims them when they do. Watch the 24 hour change, not the total.

**In-process counters and histograms. A sample in production.** Each scrape hits one arbitrary instance, and a scale-down throws its numbers away. Read them as "at least this often".

| Metric | Meaning |
| --- | --- |
| `dsgt_payment_intents_total{plan,bootcamp,addon_only}` | Intents minted, by what the server charged |
| `dsgt_membership_grants_total{source,plan}` | Grants by the path that made them |
| `dsgt_membership_grant_failures_total{source}` | A grant threw after the payment was recorded |
| `dsgt_payments_recovered_total` | Charges `reconcileMyPayments` found unrecorded |
| `dsgt_trpc_duration_seconds{procedure,type,ok}` | Histogram of every API call |
| `dsgt_process_*`, `dsgt_nodejs_*` | Default Node metrics: memory, event loop lag, GC |

A local `next dev` is one process, so these are exact there.

## Latency

`recordDuration` in `packages/api/src/trpc.ts` is the outermost middleware on every procedure builder. It times the call and labels it with the procedure path, the type and `ok`. It is outermost on purpose: a request the rate limiter rejects is still a request, and a spike of cheap rejections is what an incident looks like. The path comes from a fixed set, so label cardinality is bounded.

Buckets (seconds): 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 5, 10. A p95 or p99 is interpolated inside whichever bucket it lands in, so a threshold with no bucket edge near it is a straight line across a range. Between 5 and 10 seconds the figure is an estimate, not a measurement, and nothing above 10 is reported at all. `services/latency.test.ts` holds three things together: the bucket edges, the quantile arithmetic, and the rules in `monitoring/rules/payments.yml`. It fails if an alerted threshold has no edge, if a rule reads a recording that does not exist, or if a builder or procedure is not timed.

## Alerts

Evaluated by Prometheus from `monitoring/rules/`. There is no Alertmanager in the stack, so nothing routes a firing alert anywhere; someone has to look at Prometheus or the Grafana alert list, or add a receiver.

| Alert | Fires when | Means |
| --- | --- | --- |
| `MembershipGrantFailing` | Any grant failure in 15 minutes | Money taken, membership not granted. `reconcileMyPayments` repairs it on the member's next dashboard load |
| `UnlinkedPaymentsClimbing` | `dsgt_payments_unlinked` up by more than 5 in 24 hours, held 1 hour | Link paths are not claiming payments |
| `ReconcileRecoveringOften` | More than 3 recoveries in an hour | The webhook or the confirm call is dropping payments. Check that `payment_intent.succeeded` is subscribed in Stripe |
| `PortalApiErrorRate` | More than 10% of calls fail for 10 minutes | |
| `PortalApiSlow` | p95 above 2s for 10 minutes | |
| `PortalApiTailSlow` | p99 above 5s for 10 minutes | One call in a hundred is slow. Sort `procedure:dsgt_trpc_duration_seconds:p99` to find which, and compare event loop lag |
| `HackathonJudgingIdle` | Judging on, tables assigned, zero scores, for 30 minutes (`monitoring/rules/hackathon.yml`) | Judges may be blocked from submitting |

Two recording rules, `job:dsgt_trpc_duration_seconds:p99` and `procedure:dsgt_trpc_duration_seconds:p99`, exist because `histogram_quantile` over a 5 minute rate is the most expensive expression on the dashboard.

## Admin analytics (inside the portal)

`/admin/analytics` does not need Prometheus. It uses three admin procedures, each behind a short cache so open tabs do not multiply the load. `analyticsOverview` and `hackathonLive` poll every 15 seconds; `growth` is fetched once:

| Procedure | Shows | Cache |
| --- | --- | --- |
| `admin.analyticsOverview` | Participants, club events, live hackathons, today's badge scans and door check-ins | 15s |
| `admin.hackathonLive` | The same counts as the hackathon gauges, from `readLiveHackathons` | 15s |
| `admin.growth` | Members per month for 12 months and bootcamp enrolment per term | 300s |

See [Admin tools](./admin.md).

## Adding a metric

1. Counters and histograms: create them in `services/metrics.ts` with `registers: [registry]` and increment where the thing happens. Remember they are a sample in production.
2. Anything that must be right in production: make it a gauge set inside `refreshDbGauges`, from a count query. Keep the query read-only and cheap; the database is a 0.5 GB Neon instance.
3. If you alert on it, add the rule under `monitoring/rules/` and, for latency, make sure a bucket edge sits on the threshold. The tests will say if not.
4. Edit the dashboard in `monitoring/grafana/dashboards/dsgt-portal.json`. Changes made in the Grafana UI are overwritten.

## Code and tests

| What | Where |
| --- | --- |
| Registry, counters, gauges | `packages/api/src/services/metrics.ts` |
| Timing middleware | `packages/api/src/trpc.ts` (`recordDuration`) |
| Endpoint | `sites/mainweb/app/(portal)/api/metrics/route.ts` |
| Status page | `sites/mainweb/app/status/` (`page.tsx`, `load.ts`, `uptime.ts`, `AutoRefresh.tsx`), rules in `sites/mainweb/lib/status.ts` and `lib/uptime.ts` |
| External probe | `.github/workflows/uptime.yml`, `tooling/scripts/src/uptime-probe.ts`, `sites/mainweb/app/api/ping/route.ts` |
| Status samples | `packages/api/src/services/status-samples.ts`, table `packages/db/src/schemas/status.ts` |
| Stack and rules | `monitoring/` (`prometheus.yml`, `rules/payments.yml`, `rules/hackathon.yml`, `grafana/dashboards/dsgt-portal.json`, `README.md`) |
| Tests | `services/latency.test.ts`, `services/hackathon-metrics.test.ts`, `services/status-samples.test.ts`, `lib/status.test.ts`, `lib/uptime.test.ts`, `app/status/load.test.ts`, `app/status/uptime.test.ts`, `tooling/scripts/src/uptime-probe.test.ts` |
