# query

The central monorepo for Data Science at Georgia Tech club operations and digital infrastructure.

Two Next.js sites share one Postgres database and four internal packages. Club membership, events, bootcamp, and initiatives are modeled separately from hackathon editions, registration, teams, and judging — they share a database and touch nowhere.

**Documentation:** start at [`docs/README.md`](./docs/README.md).

## Workspace layout

| Path | Workspace | Role |
| --- | --- | --- |
| `sites/mainweb` | `web` | Public club site + authenticated portal (App Hosting) |
| `sites/hacklytics2027` | `hacklytics2027` | Hacklytics 2027 marketing site, static export (Firebase Hosting) |
| `apps/dsgt-slack` | `@query/dsgt-slack` | `@dsgt` Slack bot (HTTP webhook on mainweb in production) |
| `packages/api` | `@query/api` | tRPC routers, middleware, pricing |
| `packages/auth` | `@query/auth` | NextAuth (Google, GitHub, email codes) |
| `packages/db` | `@query/db` | Drizzle schema, client, membership rules |
| `packages/ui` | `@query/ui` | Shared React components |
| `tooling/*` | `@query/eslint-config`, `@query/prettier-config`, `@query/tailwind-config`, `@query/tsconfig` | Shared configs |

## Quick start

```bash
corepack enable
pnpm install
docker compose up -d
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/neondb \
  pnpm --filter @query/db migrate:push
pnpm dev
```

- Club site + portal: [http://localhost:3001](http://localhost:3001)
- Hacklytics 2027: [http://localhost:3000](http://localhost:3000)

Full setup, env vars, and first-admin bootstrap: [docs/getting-started.md](./docs/getting-started.md).

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Architecture (short)

```
hacklytics2027 (static) ──interest CTA──► mainweb portal
                                              │
                         @query/api  ◄──session──►  @query/auth
                                              │
                                         @query/db  →  Neon / local Postgres
```

The portal is a route group inside `sites/mainweb`, not a separate app. The event site does not query the database.

Details: [docs/architecture.md](./docs/architecture.md). Schema and the club/hackathon split: [docs/packages/db.md](./docs/packages/db.md).

## Deploy

| Surface | Platform | Config |
| --- | --- | --- |
| `web` | Firebase App Hosting / Cloud Run | `apphosting.yaml` |
| `hacklytics2027` | Firebase Hosting target `hacklytics` | `firebase.json` |

GCP project: `dsgt-website`. Local secret sync: [GCP_SETUP.md](./GCP_SETUP.md). Operations: [docs/operations/deployment.md](./docs/operations/deployment.md).

## License

Apache License 2.0. See [LICENSE](./LICENSE).
