# TODO

Open items as of 2026-09-06. Delete a line when it is done.

## Deploy

- [ ] **Roll out.** The last successful rollout predates the pnpm 10 revert, the
      resume error handling, and the p99 work below. Everything here is
      committed but not live.
- [ ] **Point Prometheus at production.** `METRICS_TOKEN` now exists in Secret
      Manager and is wired into `apphosting.yaml`, so `/api/metrics` answers
      after the next rollout. Read the value with
      `gcloud secrets versions access latest --secret=METRICS_TOKEN --project=dsgt-website`
      and scrape with `Authorization: Bearer <token>`. A 404 means the token did
      not match — that is the endpoint's designed answer, not an outage.

## p99

- [ ] **Decide on `minInstances`.** Held at 0 deliberately: one always-warm
      instance at `cpu: 2` / 1 GiB is roughly $30-50/month. The boot-time pool
      warmup in `sites/mainweb/instrumentation.ts` shortens a cold start; only
      min-instances removes it. Revisit if the scrape shows cold starts
      dominating the tail.
- [ ] **Read the histogram before optimising further.** `dsgt_trpc_duration_seconds`
      is bucketed for the tail. Everything below is a guess until it is scraped.
- [ ] **Stripe reconcile N+1** (`routers/stripe.ts`, `reconcileMyPayments`).
      One `stripePayments` lookup per intent, bounded at 20, on a user-triggered
      backstop — low value, and the surrounding grant logic is delicate.
- [ ] **Metrics are per-instance.** In-memory registry, `maxInstances: 10`,
      scale to zero: a scrape samples one instance and counters reset when it
      dies. Fleet-wide numbers need aggregation.

## Housekeeping

- [ ] **5 pre-existing lint errors**, all `import/consistent-type-specifier-style`:
      `app/HomePageClient.tsx`, `app/projects/ProjectsPageClient.tsx`,
      `components/admin/hackathons/RegistrationControls.tsx`,
      `lib/club-projects.test.ts`. `eslint --fix` clears them; kept out of the
      p99 commits to keep those diffs readable.
- [ ] **Confirm the `/events` staleness call.** The page was `force-dynamic` and
      is now `revalidate = 300`, matching `/projects`. `proxy.ts` already serves
      that path `max-age=3600`, so nobody could observe the old freshness — but
      it was an explicit choice, so it is worth a second opinion.
- [ ] **`nul`** — a 0-byte file at the repo root from a stray `> nul` redirect.
      Gitignored, inert, deletable.
