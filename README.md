# query

The central monorepo for club operations and digital infrastructure.

## Workspace layout

| Path | Contents |
| --- | --- |
| `sites/mainweb` | Public club site |
| `sites/hacklytics2027` | Hacklytics 2027 event site (static export) |
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
| `judge.ts` | `judge`, `judge_assignment`, `judging_project`, `judge_vote`, `judge_queue` |
| `initiatives.ts` | `project_leader`, `initiative`, `initiative_application` |
| `events.ts` | `event`, `event_check_in` |
| `stripe.ts` | `stripe_payment`, `user_account_link` |
| `security.ts` | `audit_logs` (+ `security_severity` enum) |
| `settings.ts` | `system_settings` |

Two entities anchor the graph:

- **`user`** — every identity-bearing table cascades from it: `account`,
  `session`, `admin`, `user_profile`, `member`, `judge`, `event`,
  `event_check_in`, `hackathon_team`, `hackathon_participant`,
  `user_account_link`, and `stripe_payment.linked_user_id`.
- **`hackathon`** — every event-scoped table cascades from it: teams,
  participants, projects, hackathon events, judges, judge assignments, judging
  projects, judge queue, and maps.

Nearly all foreign keys are `onDelete: "cascade"`, so deleting a user or a
hackathon removes its dependent rows rather than orphaning them.

### Club and hackathon are separate

Two aspects share the database and touch nowhere:

- **Hackathon** — editions, registration, teams, project submission, judging.
  Everything here hangs off a `hackathon` row.
- **Club** — `member`, `membership_history`, `event`, `event_check_in`,
  `initiative`, its applications, and the `project_leader` role. Deliberately
  **not** scoped to a hackathon. A club project runs whenever somebody leads
  one, and leading is a standing appointment rather than a yearly re-grant.
  Nothing in this half is ever judged; judges only score `hackathon_project`.

The two halves no longer cross. `member` used to be `unique(user_id,
hackathon_id)`, which welded a paid year to an edition: the day the next
hackathon opened, every paying member read as a non-member. It is now
`unique(user_id)` and a membership is defined entirely by its own dates, with
`membership_history` recording which years somebody held one. The club half
therefore works with no hackathon in the database at all.

#### One-off step — only for a database that already has the edition-scoped tables

**Check first:**

```sql
SELECT to_regclass('public.project_leader');
```

If that returns `NULL`, this database has never had the club tables. Skip
everything below — `migrate:push` simply creates them in the current shape, and
the statements here would error on tables that do not exist.

If it returns a table name, `migrate:push` cannot work the change out on its
own. `project_leader` moved from `unique(user_id, hackathon_id)` to
`unique(user_id)`, so anybody appointed in more than one edition has more than
one row; drizzle-kit fails building the new index partway and leaves the schema
half-applied. Run this against that database **once, before** the push. Every
statement is guarded, so it is safe to re-run.

```sql
BEGIN;

-- Collapse duplicate leader appointments to one row per person. Keeps the
-- oldest row, so created_at still reads as when they were first appointed, and
-- keeps the role switched on if ANY of their rows was active — dropping an
-- active appointment here silently locks a leader out of their own initiatives.
WITH ranked AS (
  SELECT
    id,
    user_id,
    bool_or(is_active) OVER (PARTITION BY user_id) AS any_active,
    row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM project_leader
)
UPDATE project_leader AS pl
SET is_active = ranked.any_active
FROM ranked
WHERE pl.id = ranked.id
  AND ranked.rn = 1
  AND pl.is_active IS DISTINCT FROM ranked.any_active;

DELETE FROM project_leader
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
    FROM project_leader
  ) dupes
  WHERE rn > 1
);

-- Drop the edition columns and everything hanging off them.
ALTER TABLE project_leader
  DROP CONSTRAINT IF EXISTS unique_project_leader_per_hackathon;
DROP INDEX IF EXISTS project_leader_hackathon_id_idx;
ALTER TABLE project_leader DROP COLUMN IF EXISTS hackathon_id;

DROP INDEX IF EXISTS initiative_hackathon_id_idx;
ALTER TABLE initiative DROP COLUMN IF EXISTS hackathon_id;

-- The constraint the new schema expects. Added here rather than left to push,
-- so a collision surfaces inside this transaction where it rolls back.
ALTER TABLE project_leader
  DROP CONSTRAINT IF EXISTS unique_project_leader;
ALTER TABLE project_leader
  ADD CONSTRAINT unique_project_leader UNIQUE (user_id);

COMMIT;
```

Initiatives themselves are untouched. Rows that were invisible because they
belonged to a past edition become visible again — that is the point, they were
club projects an edition rollover hid. Archive any that should not come back
from the leader screen afterwards.

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
