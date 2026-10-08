# Judging platform plan

**Repo:** `query` · **Drafted:** 2026-10-07 · **Working name:** `panel` (rename freely)

A hackathon judging platform built as ordinary workspaces in this monorepo
(`packages/judging-*`, `sites/judging`, scope `@query/judging-*`). Hacklytics
is its first user. It is not being split into its own repository.

The current judging code in `packages/api/src/routers/judge` and
`sites/mainweb` keeps running until cutover, then is deleted.

---

## 0. Why build it this way

**What exists** works for one event: pool dispatch with QR arrival
(`dispatch.ts`), per-judge z-scores with a Bayesian shrink (`rankings.ts`),
frozen results, printable table cards. It is also welded to one edition: a
five-column rubric in `judge_vote`, timers as constants, tracks as `text[]`,
a `"createx"` string in the matcher, one results track, table distance as
`abs(n1 - n2)`, auth and roles borrowed from the club portal, cache
per-instance and polling for every live view.

**What "real infrastructure" means here**

1. **A product, not a feature.** Own data model, own API, own UI, own deploy.
   Anyone with Postgres can run it. The club site is a client of it.
2. **Everything is data.** Rubric, tracks, prizes, timers, rooms, scoring
   weights, dispatch strategy, branding: rows and config, never code.
3. **Correct under load and partition.** Advisory locks and unique indexes for
   every write that matters; realtime as a convenience layer that can be
   switched off without losing correctness.
4. **Boring and portable.** Postgres, Node, one Docker image, optional Redis.
   No vendor SDK in the core. Cloud bits live behind adapters.
5. **Pure core.** Every decision (next table, score, rank) is a function from
   plain data to plain data, tested without a database.

---

## 1. Layout

```
packages/judging-core/    @query/judging-core    pure TS, zero runtime deps. rubric
                                                 validation, dispatch, distance,
                                                 uncertainty, aggregators, phase
                                                 state machine, timers
packages/judging-db/      @query/judging-db      Drizzle schema, SQL migrations
                                                 (generated, committed), seed, demo
packages/judging-server/  @query/judging-server  Node service: tRPC over HTTP,
                                                 OpenAPI mirror, WebSocket hub, auth
                                                 adapters, outbox + webhooks,
                                                 Prometheus metrics. Dockerfile and
                                                 optional Terraform (terraform/)
packages/judging-cli/     @query/judging-cli     import/export/seed/migrate/doctor
sites/judging/            @query/judging-web     Next.js: judge PWA, admin console,
                                                 live board, public leaderboard,
                                                 team feedback. Dockerfile
docs/judging/                                    ADRs, deploy, API, rubric guide
```

Lint, typecheck, test and build run with the rest of the repo in `ci.yml`.
`packages/api` imports `@query/judging-*` like any other workspace (§7).

---

## 2. Domain model (`@query/judging-db`)

Multi-tenant from day one so one deployment can host many events; a
single-event self-host simply has one org and one event.

```
organization        id, slug, name, branding jsonb (logo, colors, tagline)
event               id, org_id, slug, name, starts_at, ends_at,
                    phase enum (setup | submissions_open | submissions_closed |
                                judging_live | judging_closed | published | archived)
event_config        event_id pk, target_seconds, hard_limit_seconds,
                    walk_limit_seconds, submit_grace_seconds,
                    min_looks_per_project, dispatch_strategy (coverage|uncertainty),
                    pairwise_enabled, pairwise_weight, bayesian_c,
                    calibration_looks, calibration_weight,
                    feedback_cards_enabled, leaderboard_public bool,
                    board_poll_seconds (fallback when ws is off)

track               id, event_id, slug, name, kind (main|sponsor|special),
                    judge_group text, rubric_id null, position, is_active
prize               id, track_id, place, title, amount, description

rubric              id, event_id, name, is_default
criterion           id, rubric_id, position, key, label, description,
                    min, max, weight, anchors jsonb

zone                id, event_id, name, position
table                event_id, number, zone_id, x null, y null   unique(event_id, number)

project             id, event_id, external_id null, name, description,
                    team_name, members jsonb, links jsonb, table_number null,
                    zone_id null, qr_token uuid unique, arrived_first_at,
                    withdrawn_at
project_track       project_id, track_id

judge               id, event_id, external_id null, name, email, org, title,
                    status (invited|applied|approved|suspended),
                    track_id null, zone_id null, is_lead
                    unique(event_id, email)

visit               id, event_id, judge_id, project_id, judge_group,
                    handed_out_at, arrived_at null, completed_at null,
                    voided_at null, void_reason null
vote                id, visit_id unique, judge_id, project_id, event_id,
                    total numeric, comment, duration_seconds, is_calibration
vote_score          vote_id, criterion_id, value        unique(vote_id, criterion_id)
comparison          id, event_id, judge_id, judge_group, a_project_id,
                    b_project_id, outcome (a|b|tie), created_at

result_run          id, event_id, computed_at, computed_by, config_snapshot jsonb,
                    published_at null, notes
result              run_id, project_id, track_id, placement, score numeric,
                    rubric_component, pairwise_component, vote_count,
                    comparison_count, flags text[]
                    unique(run_id, project_id, track_id)

event_log           id, event_id, kind, actor jsonb, subject jsonb, payload jsonb,
                    created_at                       -- append only
outbox              id, event_id, topic, payload jsonb, created_at,
                    delivered_at null, attempts
webhook             id, org_id, url, secret, topics text[], is_active
api_key             id, org_id, hashed_key, scopes text[], created_at, revoked_at

user                id, email, name                       -- platform identities
membership          user_id, org_id, role (owner|admin|organizer|volunteer)
judge_identity      judge_id, user_id                    -- which login is which judge
```

Design notes:

- `visit` replaces `judge_queue`: it is a record of a hand-out, not a plan.
  A visit without a vote past the hard limit is voided, not deleted.
- `vote.total` is derived at write time from `vote_score` and the criterion
  weights; the score rows are the truth.
- `result_run` snapshots the config used, so a result is reproducible and an
  admin can compute twice and compare before publishing one.
- `external_id` on project and judge is how an integrator (the club site, a
  Devpost CSV, a Google Form) keeps its own identity in sync.
- Migrations are generated SQL files committed under `packages/judging-db/migrations`,
  applied with `panel migrate`. No `drizzle-kit push` in this product; a
  self-hoster needs reproducible, reviewable migrations.

---

## 3. The core (`@query/judging-core`)

No IO, no dates from the clock (every function takes `now`), no randomness
without an injected source. Each module has a fixture-based test file.

- `phase.ts` state machine: allowed transitions, what each phase permits
  (submit, apply, dispatch, vote, compute, publish). Server checks it on
  every mutation.
- `rubric.ts` `validateScores(criteria, input)`, `weightedTotal(criteria, scores)`.
- `timers.ts` `isLive`, `isPastCutoff`, taking the config.
- `distance.ts` `distance(a, b, zones)`: same zone `abs(n1 - n2)`; different
  zone a large constant plus the diff; Euclidean when `x, y` set.
- `dispatch.ts` `pickNext(candidates, judge, config, random)` with strategies:
  - `coverage`: fewest looks, nearest, random (today's algorithm).
  - `uncertainty`: coverage until `min_looks_per_project` everywhere, then
    highest rank-uncertainty first. Uncertainty = variance of normalised
    scores / sqrt(votes), plus a bonus for contested pairwise neighbours.
- `aggregate/zscore.ts`, `aggregate/bayes.ts`, `aggregate/bradleyTerry.ts`,
  `aggregate/blend.ts`, `aggregate/rank.ts` composing them per track and
  judge group, honouring calibration down-weighting.
- `uncertainty.ts` per-project vector, consumed by dispatch.
- `events.ts` typed `kind` union for the log, outbox topics and ws messages,
  shared by server and web.

Published to npm on release so anyone can run the ranking offline on an
export.

---

## 4. Server (`@query/judging-server`)

Node 22, Hono as the HTTP shell, tRPC router mounted on it, `trpc-openapi`
exposing the same procedures as REST with a generated OpenAPI document for
non-TypeScript integrators. Single process; horizontal scale is stateless
plus Redis.

**Routers**

- `org`, `event`, `config`, `track`, `prize`, `rubric`, `zone`, `table`:
  organizer CRUD, phase-gated.
- `project`: import (API, CSV via CLI), assign tables (per zone, by track
  balance), withdraw, QR token rotate.
- `judge`: invite, apply, approve, suspend, assign track and zone.
- `session` (judge-facing): `next`, `arrive(qrToken)`, `vote`, `compare`,
  `skip`, `progress`, `rubric`.
- `results`: `compute` (new `result_run`), `diff(runA, runB)`, `publish`,
  `unpublish`, `export`.
- `live`: snapshot for the admin board and public leaderboard.
- `feedback`: a team's card after publish.
- `webhook`, `apiKey`: integrator management.

**Concurrency**

- `pg_advisory_xact_lock(hashtext('dispatch:' || event_id))` around `next`,
  exactly as today. Dispatch is milliseconds and runs a few times a minute
  even at 60 judges.
- Unique indexes on `(judge_id, project_id)` across live visits (partial
  index where `voided_at is null`), on `vote.visit_id`, on
  `(run_id, project_id, track_id)`.
- Every mutation writes its `event_log` row and any `outbox` row in the same
  transaction. The outbox is drained by the same process on a short loop (no
  external scheduler) and by `panel outbox drain` for operators who want cron.

**Realtime**

- WebSocket hub on `/ws` (`ws` library). Clients subscribe to channels:
  `event:{id}:board`, `event:{id}:leaderboard`, `judge:{id}`.
- Fan-out adapter interface: `InMemoryBus` (single instance, default) and
  `RedisBus` (ioredis pub/sub) selected by `REDIS_URL`. Correctness never
  depends on the bus; a client that misses a message gets the same state on
  its next snapshot, and the web falls back to polling at `board_poll_seconds`
  when the socket is down.
- Server pushes: dispatch handed out, arrival, vote landed, judge overtime,
  phase change, results published. Admin can push `recall` to a judge
  (bring them back to the desk) and `void` a visit.

**Auth adapters** (`server/src/auth/`)

- `magic-link`: email code, built in, zero config beyond SMTP.
- `oidc`: any provider (Google, GitHub, Okta) via `openid-client`.
- `trusted-jwt`: an integrator (the club site) mints a short-lived JWT with
  `{ sub, email, name, org, role, judge_external_id }`; the server verifies
  with a shared JWKS. This is how mainweb users land in the judge PWA with
  no second login.
- `api-key`: for machine integrators (import, export, webhooks).

Roles: `owner`, `admin`, `organizer`, `volunteer` on the org; `judge` is a
row on the event, not a role, and `is_lead` is a flag. Every procedure
declares the minimum role; there is no unguarded "protected" alias, the lesson
from `../PLAN.md` W8.

**Observability**

- `/metrics` Prometheus: dispatch latency, votes per minute, live judges,
  coverage histogram per event, ws connections, outbox lag.
- Structured JSON logs with `event_id`, `judge_id`, `visit_id` on every line.
- `/healthz` (process), `/readyz` (Postgres, bus).

---

## 5. Web (`@query/judging-web`)

Next.js app, standalone output, one Docker image. Branding from
`organization.branding`; no hardcoded name or colours.

- **Judge PWA** (`/j/[eventSlug]`): installable, works on a phone with one
  hand. Screens: queue/next, walking (shows table, zone and a count-up),
  arrive by camera QR or typed table number, score (criteria rendered from
  rubric rows, anchors as tap targets, comment), compare (previous table vs
  this one, one tap), done. Scores are held in IndexedDB until the server
  acknowledges, so a dead Wi-Fi corner loses nothing; the server rejects a
  late vote past the cutoff and the client shows why.
- **Admin console** (`/o/[orgSlug]/[eventSlug]`): phase control, rubric and
  track editors, zone and table layout (grid with drag to set `x, y`),
  judges (invite, approve, assign, recall), projects (import, tables,
  withdraw), table cards print view per zone, live board (coverage heatmap by
  table, judges on the floor, overtime, idle), results (compute, diff two
  runs, inspect a project's rubric and pairwise components, publish), logs.
- **Public** (`/e/[orgSlug]/[eventSlug]`): leaderboard after publish, live
  "judging in progress" board if `leaderboard_public` (no scores, just
  coverage and phase), prize list per track.
- **Team feedback** (`/e/.../feedback/[token]`): per-criterion mean vs event
  median, anonymised comments, placement per track or "not placed". Token
  minted per project at publish; integrators can fetch it by `external_id`.

---

## 6. CLI (`@query/judging-cli`)

`panel migrate`, `panel seed demo` (an event with 40 projects, 6 judges,
three tracks, a sponsor rubric), `panel import projects <csv>` (column map in
a yaml; Devpost export supported out of the box), `panel export results
<event> --format csv|json`, `panel outbox drain`, `panel doctor` (checks
Postgres, Redis, migrations, config).

CSV import was removed from the club site on purpose (`../PLAN.md` §"what not
to build"). It is in the product because a self-hoster has no other source.
The club adapter does not use it; it imports through the API.

---

## 7. Integrating the club site

Thin and replaceable.

- `packages/api/src/routers/judging.ts` (new, small): on `promoteSubmissions`
  calls `@query/judging-server` `project.upsert` with `external_id = hackathon_project.id`;
  on judge approval calls `judge.upsert`; on publish, pulls results and
  feedback tokens back into `hackathon_result` so `/hackathons/[id]` keeps
  rendering from its own tables.
- `sites/mainweb` `/judge` becomes a trusted-JWT handoff to the judge PWA.
  Admin "Judging" tab deep-links into the console with the same handoff.
- Old `routers/judge/*` and the judging UI stay behind a feature flag per
  edition (`hackathon.judging_backend = legacy | panel`) until one event has
  run on the new system, then are deleted.
- Deploy: `@query/judging-server` and `@query/judging-web` as two Cloud Run services in the
  same GCP project, Postgres as a second Neon database (not a schema in the
  club DB, so the extraction is clean), Memorystore Redis only if more than
  one server instance is wanted. Terraform under `packages/judging-server/terraform`.

---

## 8. Phases

Each phase ships green on `pnpm test`, `lint --max-warnings 0`, `typecheck`,
`build`, and leaves the current event-day path untouched.

### Phase 0 — Scaffold and core (1 week)

- Workspaces, tsconfig, eslint boundary rule, `judging/README.md` with the
  vision, MIT `LICENSE`, ADR-001 (why standalone), ADR-002 (pure core).
- Port `pickNext`, `isLive`, `isPastCutoff`, `projectMatchesTrack`,
  `zNormalize`, the Bayesian step into `@query/judging-core` as parametrised
  functions. Bring `dispatch.test.ts` cases with them.
- Add `distance`, `phase`, `rubric`, `bradleyTerry`, `blend`, `uncertainty`
  with tests.

**Verify:** `@query/judging-core` has no dependencies and 100% of exported functions
have a test. The legacy `rankings.ts` output on the seed equals
`@query/judging-core` `rank()` output byte for byte at `pairwise_weight = 0`.

### Phase 1 — Data and server (2 weeks)

- Schema and first migration. Seed and demo.
- Hono + tRPC + OpenAPI. Routers from §4 except `live` and `feedback`.
- Auth: magic-link and trusted-jwt. Roles enforced per procedure.
- Advisory lock dispatch, visit voiding, outbox table and in-process drain.
- `event_log` on every mutation. `/metrics`, `/healthz`, `/readyz`.
- Dockerfile, `docker-compose.yml` (Postgres, server).

**Verify:** DB tests: two concurrent `next` calls never hand out the same
table; a vote after cutoff is rejected with the configured limit in the
message; phase machine refuses `vote` outside `judging_live`; every mutation
in the flow test produces exactly one log row. `panel doctor` passes in the
compose stack.

### Phase 2 — Judge PWA and admin console (3 weeks)

- Judge flow end to end with offline hold. Camera QR via `getUserMedia`.
- Admin: phases, rubric, tracks, prizes, zones, tables, judges, projects,
  table cards, results compute and publish.
- Branding from org row.

**Verify:** Playwright: seed demo, approve a judge, run a full visit on a
phone viewport, compute, publish, see the leaderboard. Kill the network
mid-score, restore, vote lands once.

### Phase 3 — Realtime and live board (1 week)

- WebSocket hub, `InMemoryBus`, `RedisBus`. Live board and leaderboard
  subscribe; fallback polling.
- Admin `recall` and `void` pushes.

**Verify:** two server instances behind compose with Redis; a vote on one
appears on a board connected to the other within one second. Stop Redis;
boards degrade to polling with a visible indicator and no errors.

### Phase 4 — Hybrid scoring and uncertainty dispatch (2 weeks)

- Compare screen, `comparison` rows, Bradley–Terry in results, blend
  components visible in the results inspector and the run diff.
- `uncertainty` strategy with a cached vector per event (in-process, hint
  only).
- Team feedback cards and tokens.

**Verify:** property test: consistent comparisons produce the transitive
order at `w = 1`; `w = 0` reproduces Phase 2 results. Simulation: 200
projects, 20 judges, three synthetic hours; top-10 Kendall tau is higher
under `uncertainty` than `coverage` at equal looks. Feedback returns 403
before publish and for the wrong token.

### Phase 5 — Club integration and first live event (2 weeks plus the event)

- `routers/judging.ts` adapter, trusted-JWT handoff, results pull-back,
  feature flag per edition.
- Terraform: two Cloud Run services, Neon connection via Secret Manager,
  optional Memorystore, uptime check and alert on `/readyz`.
- Run a small internal event on `panel`, then Hacklytics.

**Verify:** the legacy and new systems produce the same placings on a replay
of an old event's votes. Post-event retro recorded as ADR-00x.

### Phase 6 — Cleanup (1 week)

- Docs: quick start (`docker compose --profile judging up`, `panel seed demo`),
  deploy guide, API reference from OpenAPI, rubric design guide, scoring
  explainer.
- Delete `routers/judge/*` and the legacy judging UI from the club site.

**Verify:** a fresh clone runs the demo in under five minutes with nothing
but Docker.

Dropped: splitting judging into its own repository. It stays in this
monorepo.

---

## 9. Decisions taken and open

**Taken**

- Judging lives in the monorepo as `@query/judging-*` workspaces on the club
  Postgres (ADR-003). No later extraction.
- WebSockets on our own server with a bus adapter; Redis optional.
- Terraform for GCP as an optional module; Docker Compose is the primary
  documented deploy.
- Committed SQL migrations, not `push`.
- Pairwise comparisons against the judge's previous table, not a
  server-chosen comparator (no extra walk, no recall burden). Revisit after
  the Phase 4 simulation.
- CSV import exists in the product; the club adapter does not use it.

**Open**

- **Name.** `panel` is a placeholder; check npm and GitHub availability
  before Phase 6.
- **Rank visibility.** Teams outside the podium see "not placed", not a
  number. Organizer's call per event; default off.
- **Hosted mode.** Multi-tenant tables exist, but billing, org sign-up and
  abuse controls are not in this plan. Self-host first.
- **Peer voting.** Possible as `judge_group = 'peer'` with its own weight.
  Not designed here.

---

## 10. Not in this plan

- A scheduler or job queue service. The outbox drain runs in-process; cron is
  an operator option, not a requirement.
- Devpost API sync. CSV import covers it; an API adapter can come as a
  community contribution.
- Replacing the club site's registration, check-in, teams or submissions.
  Those stay in `packages/api`; only judging moves.
- Any change to `packages/db` schema beyond the `judging_backend` flag and the
  feedback token column needed for cutover.
