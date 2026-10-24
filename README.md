# query

The central monorepo for Data Science at Georgia Tech club operations and digital infrastructure.

Two Next.js sites share one Postgres database and four internal packages. Club membership, events, bootcamp, and initiatives are modeled separately from hackathon editions, registration, teams, and judging — they share a database and touch nowhere.

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
| `tooling/*` | `@query/eslint-config`, `@query/prettier-config`, `@query/tailwind-config`, `@query/tsconfig` | Shared configs |

## How it fits together

### About the site

Data Science at Georgia Tech runs on one codebase. The public club site (home, team, events, projects, history, bootcamp) needs no login. Behind it sits the member portal, where people sign in with Google, GitHub or an emailed code, pay dues through Stripe, check in at events, follow bootcamp, apply to club projects and subteams, and upload a resume. Staff use the admin tools under `/admin` to manage members, events, hackathons, initiatives, points and judging. Hackathon operations (interest, registration, teams, submissions, check-in, point store) live in the same portal, and the Hacklytics 2027 marketing site is a separate static site that sends visitors to the portal to register. Hackathon judging is room-based: organisers import or promote submissions, build rooms and a schedule, and judges grade at their desks on judging day. Details: [`docs/club-project.md`](./docs/club-project.md) and [`docs/architecture.md`](./docs/architecture.md).

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
  api -->|"announcements"| smtp
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

### Monorepo map

```mermaid
flowchart TD
  web["web (sites/mainweb)"]
  hack["hacklytics2027 (sites/hacklytics2027)"]
  api["@query/api"]
  auth["@query/auth"]
  db["@query/db"]
  ui["@query/ui"]
  subgraph tooling["tooling"]
    eslint["@query/eslint-config"]
    prettier["@query/prettier-config"]
    tailwind["@query/tailwind-config"]
    tsconfig["@query/tsconfig"]
  end

  web --> api
  web --> auth
  web --> db
  web --> ui
  api --> auth
  api --> db
  auth --> db
  web -.-> eslint
  web -.-> tailwind
  web -.-> tsconfig
  ui -.-> eslint
  ui -.-> tailwind
  ui -.-> tsconfig
  api -.-> tsconfig
  auth -.-> tsconfig
  db -.-> tsconfig
  eslint -.-> prettier
  eslint -.-> tsconfig
  prettier -.-> tsconfig
  hack ~~~ web
```

Solid lines are runtime dependencies, dotted lines are dev-time configs. `hacklytics2027` has no workspace dependencies.

### API map

`packages/api/src/root.ts` composes `appRouter` from 14 routers. Procedures are built on `publicProcedure`, `protectedProcedure` and the role gates in `middleware/procedures.ts` (`isAdmin`, `isScanner`, `isProjectLeader`, `notHackathonBanned`).

```mermaid
flowchart LR
  root["appRouter"]

  subgraph club["Club"]
    user["user"]
    member["member"]
    events["events"]
    bootcamp["bootcamp"]
    initiative["initiative"]
    subteam["subteam"]
    resume["resume"]
    team["team"]
  end

  subgraph money["Payments"]
    stripe["stripe"]
  end

  subgraph hackathon["Hackathon"]
    hackathonR["hackathon (merged): crud, registration, admin, events, content, interest, announce, bans"]
    points["points: admin, store, me"]
    judge["judge (merged): portal, admin"]
  end

  subgraph judging["judging"]
    jadmin["admin"]
    jschedule["schedule"]
    jdesk["desk"]
    jhacker["hacker"]
    jresults["results"]
  end

  adminR["admin"]

  root --> club
  root --> money
  root --> adminR
  root --> hackathonR
  root --> points
  root --> judge
  root --> judging
```

### Data model

Tables are defined in `packages/db/src/schemas`. Club tables are not scoped to a hackathon; everything in the hackathon and judging groups hangs off `hackathon`.

```mermaid
erDiagram
  user ||--o{ account : "OAuth"
  user ||--o{ session : "database sessions"
  user ||--o| member : "club membership"
  member ||--o{ membership_history : records
  user ||--o{ event_check_in : "club check-in"
  event ||--o{ event_check_in : has
  user ||--o{ stripe_payment : "linked payments"
  user ||--o{ initiative_application : applies
  initiative ||--o{ initiative_application : receives

  hackathon ||--o{ hackathon_team : has
  hackathon ||--o{ hackathon_participant : registers
  user ||--o{ hackathon_participant : is
  hackathon_team ||--o{ hackathon_participant : groups
  hackathon_team ||--o{ hackathon_project : submits
  hackathon ||--o{ hackathon_event : schedules
  hackathon_event ||--o{ hackathon_event_attendee : "check-ins"
  hackathon_participant ||--o{ hackathon_event_attendee : attends
  hackathon ||--o{ hackathon_interest : collects

  hackathon ||--o{ judge : applications
  user ||--o{ judge : applies
  judge ||--o{ judge_assignment : assigned
```

```mermaid
erDiagram
  hackathon ||--o| judging_config : configures
  hackathon ||--o{ judging_entry : has
  judging_entry ||--o{ judging_entry_member : "team members and claim links"
  hackathon ||--o{ judging_challenge : has
  judging_entry ||--o{ judging_entry_challenge : "opts in"
  judging_challenge ||--o{ judging_entry_challenge : "entered by"
  hackathon ||--o{ judging_building : has
  judging_building ||--o{ judging_room : contains
  judging_challenge ||--o{ judging_room : "scoped to"
  judging_room ||--o{ judging_room_link : "QR join links"
  judging_room_link ||--o{ judging_guest_session : "guest judges"
  hackathon ||--o{ judging_judge : roster
  user ||--o{ judging_judge : "judge account"
  judging_judge ||--o{ judging_presence : heartbeat
  judging_room ||--o{ judging_presence : "who is in room"
  hackathon ||--o{ judging_schedule : plans
  judging_schedule ||--o{ judging_appointment : slots
  judging_entry ||--o{ judging_appointment : presents
  judging_room ||--o{ judging_appointment : hosts
  judging_judge ||--o{ judging_appointment : "assigned judge"
  judging_judge ||--o{ judging_evaluation : writes
  judging_entry ||--o{ judging_evaluation : receives
  judging_evaluation ||--o{ judging_evaluation_rating : "rubric scores"
  judging_evaluation ||--o{ judging_evaluation_revision : history
  judging_judge ||--o{ judging_deliberation_section : "desk sections"
  judging_deliberation_section ||--o{ judging_deliberation_entry : orders
  judging_entry ||--o{ judging_deliberation_entry : listed
  judging_entry ||--o{ judging_placement : "final placement"
```

Other tables not drawn: `user_profile`, `club_project`, `subteam` and `subteam_application`, `member_resume`, `bootcamp_workshop` and `bootcamp_material`, `hackathon_announcement` and recipients, `hackathon_ban`, `hackathon_check_in_flag`, point adjustments, store items and purchases, `audit_logs`, `system_settings`, `admin`. The older `judging_project`, `judge_vote`, `judge_queue` and `hackathon_result` tables are retired and kept for past editions.

### Hackathon judging lifecycle

```mermaid
flowchart TD
  A["Submissions: Devpost import (importDevpost) or portal projects promoted (promoteSubmissions)"]
  B["Entries and groups: initializeGroups, listEntries, remove or restore, prize eligibility, check-in flags"]
  C["Challenges: create challenges, entries opt in (setEntryChallenges)"]
  D["Rooms and tables: buildings, rooms, createTables, archive"]
  E["Room links: generateRoomLink, QR page at /admin/judging/hackathonId/qr"]
  F["Rubric and launch: saveRubric, setLaunch"]
  G["Schedule: preview or previewCpsat, then save or saveCpsat (solver builds appointments)"]
  H["Judge assignment: assignJudges, setAssignedJudge, moves"]
  J["Judging day: join room (QR link, account or guest session), heartbeat presence"]
  K["Desk itinerary and project list"]
  L["startGrading, saveDraft, submit"]
  M["Takeover: another judge starts grading, releaseGrading frees the hold"]
  N["Missed: slot ended with no evaluation (appointment status)"]
  P["Deliberation: desk sections and ordering, scores via results.compute"]
  Q["Results: publish or unpublish, placements, evaluationAudit, reopenGrade"]
  O["Hacker side: myClaim, itinerary, feedback"]

  A --> B --> C --> D --> E --> F --> G --> H --> J
  J --> K --> L
  L --> P
  K --> M
  M --> L
  K --> N
  N --> P
  P --> Q
  Q --> O
```

### Request path

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant N as Next.js (sites/mainweb)
  participant T as tRPC route /api/trpc
  participant X as createContext
  participant M as Procedure middleware
  participant R as Router procedure
  participant D as Drizzle (@query/db)
  participant P as Postgres

  B->>N: Request page (proxy.ts sets Cache-Control)
  N-->>B: HTML and client bundle
  B->>T: tRPC call via @trpc/react-query (superjson)
  T->>X: Build context
  X->>D: Load NextAuth session (database sessions)
  X-->>T: userId, client IP, in-memory cache
  T->>M: recordDuration, requiresDb, auth check
  M->>M: sanitize inputs, content type, rate limit and DDoS check
  M->>R: Role gate (isAdmin, isScanner, isProjectLeader)
  R->>D: Query or mutation
  D->>P: SQL
  P-->>D: Rows
  D-->>R: Typed result
  R->>M: Mutations evict cache entries
  M-->>B: Response
```

Per-layer notes: [docs/architecture.md](./docs/architecture.md) (request path, auth, caching) and [docs/packages/api.md](./docs/packages/api.md).

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
