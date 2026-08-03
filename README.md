# query

The central monorepo for club operations and digital infrastructure.

## Workspace layout

| Path | Contents |
| --- | --- |
| `sites/mainweb` | Public club site |
| `sites/hacklytics2027` | Hacklytics 2027 event site (static export) |
| `sites/discordBot` | Discord bot |
| `packages/db` | Drizzle schema, client, seed script |
| `packages/api` | tRPC routers |
| `packages/auth` | NextAuth configuration |
| `packages/ui`, `packages/consts` | Shared components and constants |
| `tooling/*` | Shared eslint / tailwind / tsconfig |

## Database

Postgres, accessed through [Drizzle ORM](https://orm.drizzle.team). Production
runs on **Neon** (serverless Postgres, `us-west-2`, pooled endpoint); the
connection is made with `pg.Pool` in `packages/db/src/client.ts`, with SSL
required in production and a max pool size of 10.

Configuration is a single environment variable:

```
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

`packages/db/src/client.ts` logs a warning and leaves `db` as `null` when the
variable is absent rather than throwing, so builds that never touch the database
still succeed.

### Schema

Schemas live in `packages/db/src/schemas/` and are re-exported from
`schemas/index.ts`. Drizzle picks them up via `schema: "./src/schemas/**/*.ts"`
in `drizzle.config.ts`.

| File | Tables |
| --- | --- |
| `auth.ts` | `user`, `account`, `session`, `verificationToken` |
| `members.ts` | `user_profile`, `member`, `membership_history` |
| `admins.ts` | `admin` |
| `hackathons.ts` | `hackathon`, `hackathon_team`, `hackathon_participant`, `hackathon_project`, `hackathon_event`, `hackathon_event_attendee` |
| `judge.ts` | `judge`, `judge_assignment`, `judging_project`, `judge_vote`, `judge_queue`, `hackathon_map` |
| `events.ts` | `event`, `event_check_in` |
| `stripe.ts` | `stripe_payment`, `user_account_link` |
| `security.ts` | `audit_logs` (+ `security_severity` enum) |
| `settings.ts` | `system_settings` |

26 tables in total. Two entities anchor the graph:

- **`user`** — every identity-bearing table cascades from it: `account`,
  `session`, `admin`, `user_profile`, `member`, `judge`, `event`,
  `event_check_in`, `hackathon_team`, `hackathon_participant`,
  `user_account_link`, and `stripe_payment.linked_user_id`.
- **`hackathon`** — every event-scoped table cascades from it: teams,
  participants, projects, hackathon events, judges, judge assignments, judging
  projects, judge queue, and maps. `member` is also scoped to a hackathon.

Nearly all foreign keys are `onDelete: "cascade"`, so deleting a user or a
hackathon removes its dependent rows rather than orphaning them.

### Working with the schema

```bash
pnpm --filter @query/db migrate:push      # push schema changes to DATABASE_URL
pnpm --filter @query/db migrate:generate  # emit SQL into packages/db/drizzle
pnpm --filter @query/db studio            # Drizzle Studio
pnpm --filter @query/db db:seed           # scripts/seed.ts
```

The project is **push-based**: `packages/db/drizzle/meta/_journal.json` has no
entries and there are no generated `.sql` files, so schema changes are applied
directly with `migrate:push` rather than through a migration history. If you
want reviewable migrations, switch to `migrate:generate` and commit the output.

### Local database

`docker-compose.yml` brings up a local Postgres with the same database name as
Neon, so only `DATABASE_URL` changes between the two:

```bash
docker compose up -d
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/neondb \
  pnpm --filter @query/db migrate:push
```

It publishes on host port **5433** to avoid colliding with a system Postgres,
and has a `pg_isready` healthcheck so `migrate:push` is not run against a
container that is still starting.
