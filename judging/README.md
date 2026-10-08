# Panel

A hackathon judging product: its own data, its own API, its own web app.
Rubrics, tracks, timers, rooms, and dispatch strategy are rows, not code.
Postgres and Node are enough to run it. Set `REDIS_URL` when more than one
server process should share live updates. Without it, each process fans out
in memory, and a client that misses a message reloads the same state from
the next snapshot.

`judging/` does not import the host application. The host may call `@panel/*`.
When the product is stable it leaves this repository with
`git subtree split --prefix=judging`.

## Layout

| Path | Package | What it is |
| --- | --- | --- |
| `core/` | `@panel/core` | Pure functions. No I/O, no clock, no runtime dependencies. |
| `db/` | `@panel/db` | Schema, committed SQL migrations, demo seed. |
| `server/` | `@panel/server` | HTTP API: dispatch, votes, health, metrics. |
| `web/` | `@panel/web` | Judge desk, organizer console, public board. |
| `cli/` | `@panel/cli` | `panel migrate`, `panel seed demo`, `panel doctor`. |

## Run the core

From the repository root:

```
pnpm --filter @panel/core test
pnpm --filter @panel/core typecheck
pnpm --filter @panel/core lint
```

`pnpm test` includes `@panel/core` and `@panel/server`.

## Database and server

Postgres is the one database the rest of the monorepo uses (`DATABASE_URL`). Panel migrations add its tables there. `PANEL_DATABASE_URL` is only a fallback when `DATABASE_URL` is unset.

```
docker compose -f judging/infra/docker/docker-compose.yml up --build
```

On the host, pointed at that database:

```
$env:PANEL_DATABASE_URL = "postgres://panel:panel@localhost:54329/panel"
$env:PANEL_JWT_SECRET = "dev-only-change-me"
pnpm --filter @panel/cli panel migrate
pnpm --filter @panel/cli panel seed demo
pnpm --filter @panel/cli panel doctor
```

`panel doctor` checks Postgres, pending migrations, and `PANEL_JWT_SECRET`. Redis is reported and not required.

The HTTP server is Hono. tRPC is mounted at `/trpc`. `GET /healthz` is the process, `GET /readyz` is Postgres, `GET /metrics` is Prometheus. `GET /openapi.json` lists the REST routes. How to authenticate is in `docs/api.md`. Magic-link codes are returned in the response only when `PANEL_DEV_AUTH=1`, which is how the compose stack signs in without SMTP.
