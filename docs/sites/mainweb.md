# Main website (`web`)

Path: `sites/mainweb`  
Workspace name: `web`  
Framework: Next.js 16 App Router, React 19, Tailwind 4, `output: "standalone"`  
Dev: `next dev --port 3001`

This is the club’s public site **and** the authenticated portal. There is no separate `sites/portal` app; portal routes live in the `(portal)` route group.

## Public routes

| Path | Page |
| --- | --- |
| `/` | Home (`HomePageClient`) |
| `/team` | Team |
| `/events` | Public events |
| `/projects` | Club projects — current roster and past archive, read from `club_project` |
| `/history` | Club history |
| `/bootcamp` | Bootcamp marketing |
| `/docs` | In-app docs UI |
| `/status` | Status |
| `/sitemap.xml` / `robots.txt` | Generated via `app/sitemap.ts`, `app/robots.ts` |

`app/api/csp-report/route.ts` receives CSP report-only violations.

## Portal routes (`app/(portal)`)

Unauthenticated and authenticated product UI. `proxy.ts` marks these prefixes `private, no-store`.

| Path | Audience |
| --- | --- |
| `/login` | Sign-in (Google, GitHub if configured, email code) |
| `/verify` | Email code entry |
| `/auth/error` | NextAuth error page |
| `/dashboard` | Member home |
| `/settings` | Profile / account |
| `/club` | Membership, pass, club scanner tab |
| `/club/bootcamp` | Bootcamp (paid add-on, term-gated) |
| `/initiatives` | Browse / apply |
| `/lead`, `/lead/[id]` | Project leader |
| `/hackathons`, `/hackathons/[id]` | Edition pages (info, schedule, teams, projects, results) |
| `/hackathons/[id]/judge` | Judging for that edition |
| `/hacklytics` | Current Hacklytics interest / portal landing |
| `/submit` | Project submission |
| `/judge`, `/judge/register` | Judge home / apply |
| `/scan` | QR scanning |
| `/admin` | Staff home |
| `/admin/hackathons`, `/admin/hackathons/[id]` | Edition admin (attendees, waves, announcements, analytics, events). `[id]` is the name slug (`hacklytics-digital-bloom`), not a percent-encoded name. |
| `/admin/members` | Membership admin |
| `/admin/attendees` | Attendee tools |
| `/admin/judging` | Judging admin (sync submissions + assign judges live here) |
| `/admin/initiatives` | Initiative / proposal review |
| `/admin/bootcamp` | Bootcamp attendance |
| `/admin/staff` | Admin users |
| `/admin/analytics` | Overview |
| `/admin/audit` | Audit log |
| `/admin/projects` | Project admin |
| `/admin/setup` | Redirects to `/admin/judging`. Do not create a second hackathon from judging — create it under Hackathons. |

## API routes

| Path | Role |
| --- | --- |
| `/api/trpc/[trpc]` | tRPC fetch adapter (`GET` + `POST`) |
| `/api/auth/[...nextauth]` | NextAuth handlers |
| `/api/auth/verify-email` | Email-code verification |
| `/api/webhooks/stripe` | Stripe webhooks |

## Client data

- `lib/trpc.tsx` — `createTRPCReact<AppRouter>()`
- `lib/query-client.ts` — TanStack Query client
- `lib/use-portal-context.ts` — `user.getPortalContext`
- `(portal)/providers.tsx` — Query + tRPC providers

Helpers: `lib/hackathon-slug.ts`, `lib/phone.ts`, `lib/bootcamp-schedule.ts`, `lib/trpc-error.ts`, `lib/chunk-error.ts`, `lib/safe-callback.ts` (the last three have unit tests).

## Config highlights (`next.config.mjs`)

- Transpiles `@query/api`, `@query/auth`, `@query/db`, `@query/ui`
- `outputFileTracingRoot` is the monorepo root (needed for standalone on App Hosting)
- Security headers: HSTS, CSP (report-only unless `CSP_ENFORCE=true`), frame options SAMEORIGIN (admin print/QR iframes), Permissions-Policy (camera **not** denied — `/scan` needs it)
- React Compiler enabled

`start.sh` is a local convenience script (turbo build, firebase hosting deploy, then `pnpm dev`). Production does **not** use it; App Hosting uses `apphosting.yaml`.

## UI stack

Portal: liquid-glass CSS, Lucide icons, Stripe React, QR scanner (`@yudiel/react-qr-scanner`), Chart.js on admin analytics. Public marketing: custom Hero/Section/Navbar/Footer plus `@query/ui` glass.

## Tests

```bash
pnpm test   # includes sites/mainweb/lib
```
