// Copy for /docs. The repo's docs/ folder is the source of truth; this page is
// the short version, and each topic links to the long one on GitHub. Update
// the numbers here when docs/ changes (router count, schema files).

export type DocSection =
  "overview" | "architecture" | "api" | "database" | "frontend" | "deployment";

export const SECTIONS: { id: DocSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "api", label: "API" },
  { id: "database", label: "Database" },
  { id: "frontend", label: "Frontend" },
  { id: "deployment", label: "Deployment" },
];

export const REPO_URL = "https://github.com/DataScience-GT/query";

// Paths are relative to the repo root, on the dev branch.
export const repoLink = (path: string) => `${REPO_URL}/blob/dev/${path}`;

// term is rendered with `code` spans; body may contain them too.
export type Row = { term: string; body: string; href?: string };

export const STACK: Row[] = [
  {
    term: "Next.js 16",
    body: "App Router and React 19. One app serves the public site and the signed-in portal.",
  },
  {
    term: "tRPC 11",
    body: "Typed API at `/api/trpc`, Zod inputs, superjson, TanStack Query on the client.",
  },
  {
    term: "Drizzle ORM",
    body: "Postgres schema and queries. Neon in production, Docker Postgres locally.",
  },
  {
    term: "NextAuth v5",
    body: "Google, GitHub and a 6-digit code sent by email. Database sessions.",
  },
  {
    term: "Stripe",
    body: "Membership and bootcamp payments through Checkout, Payment Intents and a webhook.",
  },
  {
    term: "pnpm and Turborepo",
    body: "One workspace, cached `lint`, `typecheck` and `build` tasks.",
  },
];

export const READ_NEXT: Row[] = [
  {
    term: "Getting started",
    body: "Prerequisites, local Postgres, environment, first run.",
    href: "docs/getting-started.md",
  },
  {
    term: "Architecture",
    body: "How the sites and packages fit together, with diagrams.",
    href: "docs/architecture.md",
  },
  {
    term: "Contributing",
    body: "Branches, scripts, tests and review expectations.",
    href: "docs/contributing.md",
  },
  {
    term: "Documentation index",
    body: "Features, judging, operations and glossary.",
    href: "docs/README.md",
  },
];

export const QUICK_START = `# Node 24 and pnpm (see packageManager in package.json)
pnpm install
docker compose up -d        # Postgres on port 5433

# Create .env with the names in docs/operations/environment.md,
# then apply the schema:
pnpm --filter @query/db migrate:push

pnpm --filter web dev       # http://localhost:3001`;

export const TREE = `query/
  sites/
    mainweb/          public site and member portal (workspace "web")
      app/(portal)/   signed-in routes, admin, judge, API handlers
      app/docs/       this page
    hacklytics2027/   static marketing site for the hackathon
  packages/
    api/              tRPC routers, middleware, pricing
    auth/             NextAuth config, providers, mailer
    db/               Drizzle schema, client, membership rules
    ui/               shared React components
  tooling/            shared oxlint, Prettier, Tailwind, TypeScript configs
  docs/               reference docs
  apphosting.yaml     Firebase App Hosting config for mainweb`;

export const PACKAGES: Row[] = [
  {
    term: "@query/api",
    body: "tRPC routers, procedure middleware, in-memory cache and pricing.",
    href: "docs/packages/api.md",
  },
  {
    term: "@query/auth",
    body: "NextAuth configuration, providers and the email mailer.",
    href: "docs/packages/auth.md",
  },
  {
    term: "@query/db",
    body: "Drizzle schema, Postgres client and membership rules.",
    href: "docs/packages/db.md",
  },
  {
    term: "@query/ui",
    body: "Small shared component library. Not on the request path.",
    href: "docs/packages/ui.md",
  },
];

export const REQUEST_PATH: string[] = [
  "The browser calls `/api/trpc/*` through `@trpc/react-query`.",
  "`createContext` loads the NextAuth session and attaches the user id, client IP and cache.",
  "Middleware runs in order: database required, input scrubbing, content type, then rate limit and DDoS checks.",
  "A role gate runs when the procedure has one. Successful mutations evict cache entries.",
  "The procedure queries Postgres through Drizzle and returns a typed result.",
];

export const ROUTERS: Row[] = [
  { term: "user", body: "Session user, portal context, profile and image." },
  { term: "member", body: "Membership profile, pass, staff grant and revoke." },
  { term: "events", body: "Club events and QR check-in." },
  { term: "bootcamp", body: "Member progress and staff attendance." },
  {
    term: "initiative",
    body: "Club projects: applications, proposals, leaders.",
  },
  { term: "subteam", body: "Subteams, applications and rosters." },
  { term: "resume", body: "A member's own resume and the staff list." },
  {
    term: "stripe",
    body: "Checkout, Payment Intents, account linking, reconcile.",
  },
  {
    term: "hackathon",
    body: "Editions, registration, interest, events, content, announcements.",
  },
  { term: "team", body: "Hackathon teams and project submission." },
  {
    term: "points",
    body: "Hackathon points, adjustments and the point store.",
  },
  { term: "judge", body: "Judge roster: apply, approve, remove." },
  {
    term: "judging",
    body: "Room judging: admin, schedule, desk, hacker and results.",
  },
  { term: "admin", body: "Staff directory, role changes, analytics." },
];

export const PROCEDURE_KINDS: Row[] = [
  {
    term: "publicProcedure",
    body: "Optional session. DDoS and public rate limit apply.",
  },
  {
    term: "protectedProcedure",
    body: "Signed-in users. Authenticated rate limit; mutations evict cache.",
  },
  {
    term: "uploadProcedure",
    body: "Signed-in, 2MB payload cap, for base64 images.",
  },
  {
    term: "isScanner",
    body: "Active staff row, volunteers included. Door scanning.",
  },
  { term: "isAdmin", body: "Active staff, volunteers excluded." },
  {
    term: "isSuperAdmin",
    body: "Destructive actions such as deleting an edition.",
  },
  {
    term: "isProjectLeader",
    body: "Project leaders, or staff covering for one.",
  },
];

export const SCHEMA_FILES: Row[] = [
  {
    term: "auth.ts",
    body: "`user`, `account`, `session`, `verificationToken`.",
  },
  {
    term: "members.ts",
    body: "`user_profile`, `member`, `membership_history`.",
  },
  { term: "admins.ts", body: "`admin` (staff roles)." },
  { term: "events.ts", body: "`event`, `event_check_in`." },
  {
    term: "bootcamp.ts",
    body: "`bootcamp_workshop`; the ZIPs live in Cloud Storage.",
  },
  {
    term: "initiatives.ts",
    body: "`project_leader`, `initiative`, `initiative_application`.",
  },
  { term: "subteams.ts", body: "`subteam`, `subteam_application`." },
  {
    term: "club-projects.ts",
    body: "`club_project`, shown on the public projects page.",
  },
  { term: "resumes.ts", body: "`member_resume`." },
  {
    term: "hackathons.ts",
    body: "Editions, teams, participants, projects, interest, events, check-in flags, announcements.",
  },
  {
    term: "judging.ts",
    body: "The `judging_*` tables: rooms, schedule, rubric, evaluations, placements.",
  },
  {
    term: "judge.ts",
    body: "Live judge roster, plus retired tables kept for past editions.",
  },
  { term: "points.ts", body: "Point adjustments, store items and purchases." },
  { term: "stripe.ts", body: "`stripe_payment`, `user_account_link`." },
  { term: "security.ts", body: "`audit_logs`." },
  { term: "settings.ts", body: "`system_settings`, a single row." },
  {
    term: "status.ts",
    body: "`status_sample`, behind the public status page.",
  },
];

export const DB_COMMANDS = `pnpm --filter @query/db migrate:push       # apply schema changes
pnpm --filter @query/db migrate:generate   # generate SQL
pnpm --filter @query/db db:check           # fail if a declared column is missing
pnpm --filter @query/db studio             # Drizzle Studio
pnpm --filter @query/db db:seed`;

export const PUBLIC_ROUTES: Row[] = [
  { term: "/", body: "Home." },
  { term: "/team", body: "Team." },
  {
    term: "/events",
    body: "Club events. Bootcamp sessions are not listed here.",
  },
  { term: "/projects", body: "Current and past club projects." },
  { term: "/history", body: "Club history." },
  { term: "/bootcamp", body: "The current term's sessions and how to join." },
  { term: "/status", body: "Uptime and latency from real traffic." },
  { term: "/docs", body: "This page. Requires a signed-in session." },
];

export const PORTAL_ROUTES: Row[] = [
  {
    term: "/login, /verify",
    body: "Sign in with Google, GitHub or an emailed code.",
  },
  { term: "/dashboard, /settings", body: "Member home and profile." },
  { term: "/club", body: "Membership, pass and club events." },
  {
    term: "/initiatives, /lead",
    body: "Browse and apply; project leader tools.",
  },
  {
    term: "/hacklytics, /hackathons",
    body: "Interest, registration, teams and results.",
  },
  { term: "/submit", body: "Project submission for team captains." },
  { term: "/judge", body: "Judge application and the judging desk." },
  { term: "/scan", body: "QR scanning for staff and volunteers." },
  { term: "/admin", body: "Staff tools. Appointed roles only." },
];

export const DESIGN: Row[] = [
  {
    term: "Theme",
    body: "Dark by default. Page background `#050505`, accent teal `#00A8A8`.",
  },
  {
    term: "Type",
    body: "Geist Sans for text, Geist Mono for small uppercase labels.",
  },
  { term: "Styling", body: "Tailwind 4 utilities. Icons from Lucide." },
  {
    term: "Public pages",
    body: "Shared `Navbar`, `Section` and `Footer` components, as on this page.",
  },
  {
    term: "Portal",
    body: "Liquid-glass CSS and the `LiquidGlass` component in `components/portal`.",
  },
];

export const HOSTING: Row[] = [
  {
    term: "mainweb",
    body: "Firebase App Hosting on Cloud Run, configured in `apphosting.yaml`. Node 24, concurrency 80, up to 10 instances.",
    href: "docs/operations/deployment.md",
  },
  {
    term: "hacklytics2027",
    body: "Static export on Firebase Hosting. It never talks to the database.",
    href: "docs/sites/hacklytics2027.md",
  },
  {
    term: "Secrets",
    body: "GCP Secret Manager, mapped in `apphosting.yaml`. Names only are documented.",
    href: "docs/operations/environment.md",
  },
];

export const BUILD_STEPS: string[] = [
  "`pnpm install`.",
  "`drizzle-kit push` applies additive schema changes. Anything destructive stops and is skipped.",
  "`db:check` fails the build if a declared column is still missing.",
  "`pnpm turbo run build --filter=web`, then the static assets are copied into the standalone output.",
];

export const CI: Row[] = [
  {
    term: "ci.yml",
    body: "On every pull request and push to `main` or `dev`: lint, typecheck, test, build. The Hacklytics preview and live deploys run after it passes.",
    href: "docs/operations/ci-cd.md",
  },
  {
    term: "mainweb deploy",
    body: "Not part of `ci.yml`. App Hosting builds from the repo itself, so require the CI check on `main`.",
  },
];

export const SCRIPTS = `pnpm dev          # every workspace dev task
pnpm build        # turbo run build
pnpm lint         # oxlint, zero warnings allowed
pnpm typecheck    # tsrs --noEmit
pnpm test         # Vitest`;
