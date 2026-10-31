# query

The central monorepo for Data Science at Georgia Tech club operations and digital infrastructure.

mainweb and four internal packages share one Postgres database; the Hacklytics site is a static export. Club membership, events, bootcamp, and initiatives are modeled separately from hackathon editions, registration, teams, and judging — they share a database and touch nowhere.

**Documentation:** start at [`docs/README.md`](./docs/README.md).

## Club project

The public website and member portal for Data Science at Georgia Tech, live at [datasciencegt.org](https://datasciencegt.org). This is production club infrastructure (not a greenfield student app).

Member-facing overview — what it is, what members use, current status, and how to help: [`docs/club-project.md`](./docs/club-project.md). Local setup and PR workflow stay in [`docs/getting-started.md`](./docs/getting-started.md) and [`docs/contributing.md`](./docs/contributing.md).

## Workspace layout

| Path | Workspace | Role |
| --- | --- | --- |
| `sites/mainweb` | `web` | Public club site + authenticated portal (App Hosting) |
| `sites/hacklytics2027` | `hacklytics2027` | Hacklytics 2027 marketing site, static export (Firebase Hosting) |
| `packages/api` | `@query/api` | tRPC routers, middleware, pricing |
| `packages/auth` | `@query/auth` | NextAuth (Google, GitHub, email codes) |
| `packages/db` | `@query/db` | Drizzle schema, client, membership rules |
| `packages/ui` | `@query/ui` | Shared React components |
| `tooling/*` | `@query/oxlint-config`, `@query/prettier-config`, `@query/tailwind-config`, `@query/tsconfig` | Shared configs |

## How it fits together

### About the site

Data Science at Georgia Tech runs on one codebase. The public club site (home, team, events, projects, history, bootcamp) needs no login. Behind it sits the member portal, where people sign in with Google, GitHub or an emailed code, pay dues through Stripe, check in at events, follow bootcamp, apply to club projects (initiatives) and subteams, and upload a resume. Staff use the admin tools under `/admin`. Hackathons (interest, registration, teams, submissions, check-in, point store, room-based judging) live in the same portal, and the Hacklytics 2027 marketing site is a separate static site that sends visitors to the portal to register. Details: [`docs/club-project.md`](./docs/club-project.md).

### System overview

```mermaid
flowchart LR
  visitor["Visitors and members (browser)"]
  staff["Admins, scanners, judges (browser)"]

  subgraph web["sites/mainweb (workspace web)"]
    pub["Public pages: / /team /events /projects /history /bootcamp"]
    portal["Portal: /login /dashboard /club /hacklytics /hackathons /judge /submit"]
    admin["Admin: /admin/*"]
    routes["Route handlers: /api/trpc /api/auth /api/webhooks/stripe /api/resume /api/bootcamp/materials"]
  end

  hack["sites/hacklytics2027 (static export)"]
  api["@query/api (tRPC appRouter)"]
  auth["@query/auth (NextAuth)"]
  db["@query/db (Drizzle)"]
  pg[("Postgres: Neon or local")]

  stripe["Stripe"]
  smtp["SMTP email provider"]
  gcs["Cloud Storage buckets: resumes, bootcamp materials"]
  oauth["Google and GitHub OAuth"]
  devpost["Devpost export (judging import)"]

  visitor --> pub
  visitor --> portal
  visitor --> hack
  staff --> admin
  staff --> portal
  hack -->|"interest CTA: /login?callbackUrl=/hacklytics"| portal
  portal --> routes
  admin --> routes
  routes --> api
  routes --> auth
  api --> db
  auth --> db
  db --> pg
  auth --> oauth
  auth -->|"6-digit sign-in code"| smtp
  api -->|"transactional mail (via @query/auth Mailer)"| smtp
  routes --> gcs
  stripe -->|"webhook"| routes
  api --> stripe
  devpost -.->|"imported by organisers"| api

  subgraph deploy["Deploy"]
    ah["Firebase App Hosting / Cloud Run (apphosting.yaml)"]
    fh["Firebase Hosting target hacklytics (firebase.json)"]
    ci["GitHub Actions CI/CD (.github/workflows/ci.yml)"]
  end

  web -.-> ah
  hack -.-> fh
  ci -->|"verified build"| fh
  ci -.->|"lint, typecheck, test, build"| web
```

mainweb is built by Firebase App Hosting from the repo itself; CI only verifies it. The Hacklytics site never queries the database.

### Basic flow

```mermaid
flowchart TD
  v["Visitor browses the public site"]
  s["Signs in with Google, GitHub or an emailed code"]
  p["Member portal"]
  m["Optional: pay dues through Stripe and become a member"]
  e["Events check-in"]
  r["Resume book"]
  b["Bootcamp"]
  st["Subteams and initiatives"]
  reg["Hackathon: register"]
  acc["Accepted"]
  tm["Form or join a team"]
  ci["Check in at the event"]
  pt["Points"]
  sub["Submit projects"]
  j["Judging"]
  res["Results"]

  v --> s --> p
  p --> e
  p --> r
  p --> b
  p --> st
  p -.-> m
  m -->|"required to apply"| st
  s --> reg --> acc
  acc --> tm
  acc --> ci
  ci --> pt
  ci --> sub
  tm --> sub
  sub --> j --> res
```

### Docs

- [Docs index](./docs/README.md)
- [Architecture](./docs/architecture.md)
- [Hackathon judging](./docs/judging/README.md)
- [Judging scheduler deep dive](./docs/judging/scheduler.md)
- [Adaptive judging](./docs/judging/adaptive.md)
- [Features](./docs/README.md#features)

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

Or, for a throwaway environment with seeded fake data and a local mail inbox that cannot reach production: `pnpm local:up`, then `pnpm dev`. See [Local test environment](./docs/getting-started.md#local-test-environment-one-command).

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
