# Panel

A hackathon judging product: its own data, its own API, its own web app.
Rubrics, tracks, timers, rooms, and dispatch strategy are rows, not code.
Postgres and Node are enough to run it. Redis is optional and never required
for a correct result.

`judging/` does not import the host application. The host may call `@panel/*`.
When the product is stable it leaves this repository with
`git subtree split --prefix=judging`.

## Layout

| Path | Package | What it is |
| --- | --- | --- |
| `core/` | `@panel/core` | Pure functions. No I/O, no clock, no runtime dependencies. |
| `db/` | `@panel/db` | Schema and committed SQL migrations. Not built yet. |
| `server/` | `@panel/server` | HTTP API. Not built yet. |
| `web/` | `@panel/web` | Judge, admin, and public views. Not built yet. |
| `cli/` | `@panel/cli` | Migrate, seed, import, export. Not built yet. |

## Run the core

From the repository root:

```
pnpm --filter @panel/core test
pnpm --filter @panel/core typecheck
pnpm --filter @panel/core lint
```

`pnpm test` includes `@panel/core`.
