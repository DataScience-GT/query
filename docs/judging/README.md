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

| Route | Who | What |
| --- | --- | --- |
| `/api/panel/*` | the pages below | The judging API. Same routes as `docs/judging/api.md`, without the prefix. |
| `/judge/panel/[org]/[event]` | approved judges | Judge desk: next table, QR or table number, scores, pairwise, offline hold. |
| `/admin/judging/panel/[org]/[event]` | staff | Organizer console: phases, floor, tables, rubric, tracks, judges, results. |
| `/judging/[org]/[event]` | anyone | Public board while judging, placements after publish. |
| `/judging/[org]/[event]/feedback/[token]` | a team | That team's feedback card after publish. |

Roles come from the `admins` row: `super_admin` is owner, other staff are
admin, a volunteer row is volunteer, a bug tester has none. A judge is matched
by the email on their portal judge row for an edition whose
`judging_backend` is `panel`. Projects and judges are copied in process when
an organizer promotes submissions or approves a judge, and published results
are pulled back into `hackathon_result`.

Set `PANEL_EVENT_ID`, `PANEL_ORG_SLUG`, and `PANEL_EVENT_SLUG` to the judging
event an edition uses. Without them the portal shows no panel links.

Live views poll. There is no WebSocket in the portal process; the board uses
the event's `board_poll_seconds` and the console polls the floor every five
seconds.

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

Webhooks queue in `outbox`. Drain them with `panel outbox drain`, on a
schedule if an event uses webhooks.
