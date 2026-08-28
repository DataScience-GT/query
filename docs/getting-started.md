# Getting started

This guide gets a local copy of **query** running: Postgres, schema, env, and both Next.js sites.

## Prerequisites

- **Node.js** `>=20.16.0 <24` (`.nvmrc` pins `20`; CI also uses 20 and 22)
- **pnpm** `10.33.2` (see `packageManager` in the root `package.json`)
- **Docker** (for local Postgres)
- Optional: **gcloud** and **Firebase CLI** if you need production secrets or deploys

Enable Corepack so the repo’s pnpm version is used:

```bash
corepack enable
corepack prepare pnpm@10.33.2 --activate
```

## Install

```bash
pnpm install
```

Workspaces are defined in `pnpm-workspace.yaml`: `apps/*`, `sites/*`, `packages/*`, and `tooling/*`.

## Local database

Production uses Neon (serverless Postgres). Locally, `docker-compose.yml` starts Postgres 15 with the same database name (`neondb`) so only `DATABASE_URL` changes.

```bash
docker compose up -d
```

It listens on host port **5433** so it does not collide with a system Postgres on 5432. Wait for the healthcheck (`pg_isready`) before pushing schema.

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/neondb \
  pnpm --filter @query/db migrate:push
```

Schema work is **push-based**. There is no committed SQL migration history. See [Database](./packages/db.md) for generate, Studio, drift checks, and the one-off club-table migration.

## Environment

Copy the names from [Environment variables](./operations/environment.md) into a root `.env` (and `sites/mainweb/.env.local` if you prefer Next’s local loader). The minimum to boot the portal against local Postgres:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/neondb
AUTH_SECRET=<random 32+ byte string>
NEXTAUTH_SECRET=<same as AUTH_SECRET>
AUTH_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3001
```

Google / GitHub OAuth, SMTP, and Stripe are optional for browsing public pages. Login, membership checkout, and email codes need the corresponding secrets.

If you have GCP access to project `dsgt-website`, you can pull secrets instead of typing them. See [GCP_SETUP.md](../GCP_SETUP.md) and [Deployment](./operations/deployment.md).

## Run

From the repo root:

```bash
pnpm dev
```

Turbo runs every workspace `dev` task. The two sites:

| Site | URL | Notes |
| --- | --- | --- |
| Main website + portal | [http://localhost:3001](http://localhost:3001) | Next.js App Router, `output: "standalone"` |
| Hacklytics 2027 | [http://localhost:3000](http://localhost:3000) | Static-export marketing site (`--turbopack`) |

Useful filters:

```bash
pnpm --filter web dev                 # main site only
pnpm --filter hacklytics2027 dev      # event site only
pnpm --filter @query/db studio        # Drizzle Studio
```

## Common scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | All workspace `dev` tasks |
| `pnpm build` | `turbo run build` |
| `pnpm lint` | ESLint across workspaces (`--max-warnings 0`) |
| `pnpm typecheck` | `tsc --noEmit` via Turbo |
| `pnpm test` | Vitest: `packages/api`, `packages/db`, `sites/mainweb/lib`, `apps/dsgt-slack` |
| `pnpm format` | Prettier write |

Database scripts live on `@query/db`:

```bash
pnpm --filter @query/db migrate:push
pnpm --filter @query/db migrate:generate
pnpm --filter @query/db db:check
pnpm --filter @query/db studio
pnpm --filter @query/db db:seed
```

## First-admin bootstrap

Staff roles live in the `admin` table. After signing in once (so a `user` row exists), grant yourself `super_admin` in the database, then use `/admin/staff` to appoint others. There is no public self-serve admin signup.

## Troubleshooting

**`DATABASE_URL not set - database operations will fail`**  
The db client logs this and leaves `db` as `null` so builds that never query still succeed. Public and authenticated tRPC procedures then fail with `PRECONDITION_FAILED: Database unavailable`. Set `DATABASE_URL` and restart.

**OAuth “State cookie was missing”**  
`AUTH_URL` / `NEXTAUTH_URL` must match the origin you actually open (including port). PKCE + state checks are required; do not disable them.

**Port already in use**  
Mainweb is `--port 3001`. Hacklytics uses Next’s default 3000.
