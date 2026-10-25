# Status page

`/status` shows whether the site is up, how fast it is, and 90 days of uptime history. It is read from Postgres and revalidated every 60 seconds (`export const revalidate = 60`).

## Where the numbers come from

There is no probe and no background worker. Every tRPC procedure is already timed by the `recordDuration` middleware in `packages/api/src/trpc.ts`; the same middleware feeds `packages/api/src/services/status-samples.ts`, which counts each call into an in-process five-minute bucket (requests, server errors, a bounded sample of durations for p50 and p95).

The first call that lands in a later bucket writes the finished bucket to `status_sample` and returns without waiting. The write is an upsert that adds to an existing row. It runs `select 1` and stores whether it answered and how long it took. A failed write is retried with the next flush (up to 12 buckets, then dropped) and counted in `dsgt_status_sample_write_failures_total`. About once a day the same code deletes rows older than 90 days.

Consequences, stated plainly:

- A quiet period has no rows. The page shows it as no data, never as down.
- The newest bucket appears about five minutes late, and an instance that scales down loses the bucket it had open.
- Only tRPC traffic is counted. Pages served without an API call are not.
- A database that is fully down cannot store its own outage. The live check on the page (a `select 1` at render time) and the retried bucket's saved ping cover that.

## Table

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

## Uptime rule

Instances are summed per bucket first. A five-minute bucket is **up** when every instance's `db_ok` is true and `errors / requests` is under 5%. Uptime % is up minutes divided by minutes with data. The rule lives in `sites/mainweb/lib/status.ts` and is tested in `lib/status.test.ts`.

## Current status

Derived from the live check and the last 15 minutes of buckets:

- **Down**: the live `select 1` failed, or at least half of the requests in the last 15 minutes were server errors.
- **Degraded**: a bucket in the last 15 minutes broke the uptime rule, or the live ping took over 1 second.
- **Operational**: anything else, including when there is no recent traffic.

## What the page shows

The status headline with the reason, 90 day and 30 day uptime, a 90 day strip with one bar per UTC day (colour by uptime: 99% or better, 95 to 99%, under 95%, gray for no data, with a tooltip and a table view), a 24 hour p95 latency chart (slowest instance per bucket) and a 24 hour requests and errors chart. Times are Eastern. The loader is `sites/mainweb/app/status/load.ts`; if the database is asleep the page renders Down with empty charts rather than failing.
