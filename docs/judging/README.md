# Panel

Hackathon judging inside the portal. Rubrics, tracks, timers, rooms, and
dispatch strategy are rows, not code. It runs in the mainweb process on the
club Postgres, and the portal sign-in decides who is judging or organizing.

## Layout

| Path | Package | What it is |
| --- | --- | --- |
| `packages/judging-core/` | `@query/judging-core` | Pure functions. No I/O, no clock, no runtime dependencies. |
| `packages/judging-db/` | `@query/judging-db` | Schema, committed SQL migrations, demo seed. |
| `packages/judging-server/` | `@query/judging-server` | The judging API (Hono + tRPC) as a library. |
| `packages/judging-cli/` | `@query/judging-cli` | `panel migrate`, `panel seed demo`, `panel doctor`, `panel outbox drain`. |
| `packages/api/src/services/panel.ts` | `@query/api/panel` | One API instance per process, and the portal user as a judging actor. |

## In the portal

Judging is per hackathon edition. On `/admin/judging`, staff pick the edition
and press "Switch to panel judging". That creates the edition's judging event
(organization `hacklytics`, event slug = the hackathon id) in `setup`, with
default timers and the club's five criteria out of ten, then copies in the
submitted projects and the portal's judges. Switching back to classic leaves
the event in place.

| Route | Who | What |
| --- | --- | --- |
| `/api/panel/*` | the pages below | The judging API. Same routes as `docs/judging/api.md`, without the prefix. |
| `/judge/panel/[hackathonId]` | approved judges | Judge desk: next table, QR or table number, scores, pairwise, offline hold. |
| `/admin/judging/panel/[hackathonId]` | staff | Organizer console: phases, floor, tables, rubric, tracks, judges, results. |
| `/judging/[hackathonId]` | anyone | Public board while judging, placements after publish. |
| `/judging/[hackathonId]/feedback/[token]` | a team | That team's feedback card after publish. |

Roles come from the `admins` row: `super_admin` is owner, other staff are
admin, a volunteer row is volunteer, a bug tester has none. A judge is matched
by the email on their portal judge row. Approving a judge in the portal
approves them in judging, and deactivating suspends them. Promoting
submissions copies projects in, and pulling results writes published
placements back into `hackathon_result`.

Live views poll, and only while they can change. The board polls at the
event's `board_poll_seconds` and the console polls the floor every five
seconds, both only during `judging_live` and only while the tab is visible. The judge
desk asks `/v1/session/status` every 15 seconds while a visit is open and the
screen is on, which is how a recall or a voided visit reaches the phone.
Neon suspends after five idle minutes and the free plan has 100 compute hours
a month, so a forgotten board in any other phase must not keep it awake.
`/api/panel/readyz` and `/api/panel/metrics` are not exposed for the same
reason. Judging uses the club's connection pool rather than a second one.

## Checks

`pnpm lint`, `pnpm typecheck`, and `pnpm test` at the root cover these
packages with the rest of the repository.

## Database

Postgres is the one database the rest of the monorepo uses (`DATABASE_URL`).
Panel migrations add its tables there.

```
docker compose up -d
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/neondb"
pnpm --filter @query/judging-cli panel migrate
pnpm --filter @query/judging-cli panel seed demo
pnpm --filter @query/judging-cli panel doctor
```

Webhooks queue in `outbox`. Publishing results drains it; delivered rows are
deleted, since `event_log` keeps the history. A delivery that failed stays
queued for `panel outbox drain`. A Hacklytics-size event is on the order of
20 MB across the judging tables.
