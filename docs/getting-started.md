# Getting started

This guide gets a local copy of **query** running: Postgres, schema, env, and both Next.js sites.

## Prerequisites

- **Node.js** `>=24.11.0 <25` (`.nvmrc` pins `24`; CI uses it too)
- **pnpm** `12.3.4` (see `packageManager` in the root `package.json`)
- **Docker** (for local Postgres)
- Optional: **gcloud** and **Firebase CLI** if you need production secrets or deploys

Enable Corepack so the repo’s pnpm version is used:

```bash
corepack enable
corepack prepare pnpm@12.3.4 --activate
```

## Install

```bash
pnpm install
```

Workspaces are defined in `pnpm-workspace.yaml`: `sites/*`, `packages/*`, and `tooling/*`.

## Local test environment (one command)

```bash
pnpm local:up
pnpm dev
```

`local:up` copies `.env.example` to `.env` and `sites/mainweb/.env.local` (never overwriting), starts `docker-compose.local.yml` (Postgres on **5434** and [Mailpit](https://mailpit.axllent.org)), pushes the schema and seeds fake data. Nothing in it reaches an outside service. `pnpm local:down` stops the containers and keeps the data; `pnpm local:reset` also deletes it.

**Signing in.** Google and GitHub need real OAuth apps, so use the email code instead. Enter `admin@example.test` (super admin) on `/login`, open Mailpit at [http://localhost:8025](http://localhost:8025) and type the 6-digit code from the message. Any address works; it is delivered to Mailpit and nowhere else. Other seeded accounts, all at `example.test`: `member-new`, `member-cont`, `member-lapsed`, `visitor-1`, `visitor-2`, `hacker-1` to `hacker-8` and `judge`.

**What the seed holds.** An admin, three members (one with the current bootcamp, one lapsed) and non-members; club events and four bootcamp sessions for the current term with workshops and check-ins; an in-progress hackathon edition with eight registrations in every status, two teams and submitted projects; an open judging setup (challenges, rooms, rubric, judges, entries); 144 `status_sample` rows for `/status`; and the club project roster. `pnpm --filter @query/db db:seed` is safe to re-run.

**Payments.** `STRIPE_MOCK_MODE=true` (the default in `.env.example`) records a paid membership with no network call. To try real Checkout, switch it off and set **test-mode** keys (`sk_test_`, `pk_test_`); see [Stripe test cards](https://docs.stripe.com/testing), e.g. `4242 4242 4242 4242`.

**Guardrails.** `tooling/scripts/src/guard-local.ts` runs before `migrate:push`, `db:seed`, `db:seed:club-projects`, `pnpm test`, `pnpm local:up` and the mainweb `dev` script. It refuses a `DATABASE_URL` that is not `localhost`, `127.0.0.1`, `::1`, `db` or `postgres`, and an SMTP host that is not local, unless `ALLOW_NON_LOCAL_SERVICES=1` is set. It refuses Stripe live keys (`sk_live_`, `rk_live_`, `pk_live_`) whenever `NODE_ENV` is not `production`, with no override. An unset `DATABASE_URL` passes, which is how CI runs. Deploys call `drizzle-kit push` directly and are unaffected. The resume and bootcamp buckets are unset locally, so uploads return 503 rather than touching Cloud Storage.

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
| `pnpm test` | Vitest: `packages/api`, `packages/db`, `sites/mainweb/lib` |
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
