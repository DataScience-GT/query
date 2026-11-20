# TODO

Open items as of 2026-11-19. Delete a line when it is done.

## Deploy

- [ ] **Point Prometheus at production.** `METRICS_TOKEN` now exists in Secret
      Manager and is wired into `apphosting.yaml`, so `/api/metrics` answers
      after the next rollout. Read the value with
      `gcloud secrets versions access latest --secret=METRICS_TOKEN --project=dsgt-website`
      and scrape with `Authorization: Bearer <token>`. A 404 means the token did
      not match — that is the endpoint's designed answer, not an outage.

## p99

- [ ] **Decide on `minInstances` and Neon's suspend delay before Hacklytics.**
      Held until then on purpose (decided 2026-11-19). `/status` now records
      p99, and the worst buckets (0.8 to 1.3 s p95) line up with Neon waking
      after 5 idle minutes, not with cold starts: `/api/ping`, which never
      touches the database, stays at 300 to 550 ms. A longer suspend delay on a
      paid Neon plan is the cheapest fix; `minInstances: 1` (roughly
      $30-50/month at `cpu: 2` / 1 GiB) and `DB_POOL_MIN` (keeps Neon awake)
      cost more.
- [ ] **Read the histogram before optimising further.** `dsgt_trpc_duration_seconds`
      is bucketed for the tail. Everything below is a guess until it is scraped.
- [ ] **Stripe reconcile N+1** (`routers/stripe.ts`, `reconcileMyPayments`).
      One `stripePayments` lookup per intent, bounded at 20, on a user-triggered
      backstop — low value, and the surrounding grant logic is delicate.
- [ ] **Metrics are per-instance.** In-memory registry, `maxInstances: 10`,
      scale to zero: a scrape samples one instance and counters reset when it
      dies. Fleet-wide numbers need aggregation.

## Housekeeping

- [ ] **Confirm the `/events` staleness call.** The page was `force-dynamic` and
      is now `revalidate = 300`, matching `/projects`. `proxy.ts` already serves
      that path `max-age=3600`, so nobody could observe the old freshness — but
      it was an explicit choice, so it is worth a second opinion.
