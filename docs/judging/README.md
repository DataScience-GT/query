# Panel

A hackathon judging product: its own data, its own API, its own web app.
Rubrics, tracks, timers, rooms, and dispatch strategy are rows, not code.
Postgres and Node are enough to run it. Set `REDIS_URL` when more than one
server process should share live updates. Without it, each process fans out
in memory, and a client that misses a message reloads the same state from
the next snapshot.

Panel is part of this monorepo. Its packages are ordinary workspaces next to
the club's, and `packages/api` calls `@query/judging-core` directly.

## Layout

| Path | Package | What it is |
| --- | --- | --- |
| `packages/judging-core/` | `@query/judging-core` | Pure functions. No I/O, no clock, no runtime dependencies. |
| `packages/judging-db/` | `@query/judging-db` | Schema, committed SQL migrations, demo seed. |
| `packages/judging-server/` | `@query/judging-server` | HTTP API: dispatch, votes, health, metrics. |
| `sites/judging/` | `@query/judging-web` | Judge desk, organizer console, public board. |
| `packages/judging-cli/` | `@query/judging-cli` | `panel migrate`, `panel seed demo`, `panel doctor`. |

## Run the core

From the repository root:

```
pnpm --filter @query/judging-core test
pnpm --filter @query/judging-core typecheck
pnpm --filter @query/judging-core lint
```

`pnpm test` includes `@query/judging-core` and `@query/judging-server`.

## Database and server

Postgres is the one database the rest of the monorepo uses (`DATABASE_URL`). Panel migrations add its tables there. `PANEL_DATABASE_URL` is only a fallback when `DATABASE_URL` is unset.

```
docker compose --profile judging up -d --build
```

On the host, pointed at that database:

```
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/neondb"
$env:PANEL_JWT_SECRET = "dev-only-change-me"
pnpm --filter @query/judging-cli panel migrate
pnpm --filter @query/judging-cli panel seed demo
pnpm --filter @query/judging-cli panel doctor
```

`panel doctor` checks Postgres, pending migrations, and `PANEL_JWT_SECRET`. Redis is reported and not required.

The HTTP server is Hono. tRPC is mounted at `/trpc`. `GET /healthz` is the process, `GET /readyz` is Postgres, `GET /metrics` is Prometheus. `GET /openapi.json` lists the REST routes. How to authenticate is in `docs/judging/api.md`. Magic-link codes are returned in the response only when `PANEL_DEV_AUTH=1`, which is how the compose stack signs in without SMTP.
