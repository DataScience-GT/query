# Documentation

This folder is the reference for **query**, the Data Science at Georgia Tech (DSGT) monorepo for club operations and digital infrastructure.

Members looking for a club-language overview should start at [Club project](./club-project.md). For local setup and review rules, jump to the page that matches the work you are doing.

| Document | What it covers |
| --- | --- |
| [Club project](./club-project.md) | What the live site is, who uses it, current status, how to help |
| [Getting started](./getting-started.md) | Prerequisites, local Postgres, env vars, first `pnpm dev` |
| [Architecture](./architecture.md) | How the two sites and four packages fit together |
| [Contributing](./contributing.md) | Branches, scripts, tests, and review expectations |
| [Environment variables](./operations/environment.md) | Every env var the process actually reads |
| [Deployment](./operations/deployment.md) | Firebase App Hosting, Firebase Hosting, GCP secrets |
| [CI/CD](./operations/ci-cd.md) | GitHub Actions, Dependabot, branch automation |
| [Security](./operations/security.md) | Auth gates, rate limits, CSP, input scrubbing |
| [Testing](./operations/testing.md) | Vitest, Playwright, and what each suite protects |
| [Glossary](./glossary.md) | Club vs hackathon vocabulary |

## Features

One page per feature of the site.

| Document | What it covers |
| --- | --- |
| [Membership](./features/membership.md) | Accounts, profiles, membership, portal context |
| [Club events](./features/events.md) | Club events and check-in |
| [Points](./features/points.md) | Points and the point store |
| [Teams](./features/teams.md) | Teams, subteams, initiatives |
| [Payments](./features/payments.md) | Stripe and pricing |
| [Admin](./features/admin.md) | Admin tools |
| [Email](./features/email.md) | Email fan-out and limits |
| [Status](./features/status.md) | Status page, metrics, latency |
| [Hackathons](./features/hackathons.md) | Editions, registration, interest, bans, announcements, content, visibility, hackathon events |
| [Judge portal](./features/judge-portal.md) | Judge accounts, applications and the judge portal |
| [Resume book](./resume-book.md) | Member uploads, the two staff views, limits, and why files skip tRPC |
| [Bootcamp materials](./bootcamp-materials.md) | Weekly workshop ZIPs: who can download one, publishing, session dates, storage |

## Hackathon judging

Room-based judging, from setup to results.

| Document | What it covers |
| --- | --- |
| [Overview](./judging/README.md) | Judging lifecycle and links to the rest |
| [Setup](./judging/setup.md) | Config, challenges, Devpost import, rooms and tables, judges, scope, checklist |
| [Judging day](./judging/judging-day.md) | Desk, itinerary, queue judging, claims, presence, appointment status, takeover, grading hold, notify |
| [Scoring and results](./judging/scoring-and-results.md) | Evaluation, scoring, calibration, deliberation, placements, results |
| [Scheduler](./judging/scheduler.md) | Room-judging scheduler deep dive |
| [Adaptive judging](./judging/adaptive.md) | Setup advice, suggested timing, archive rooms, live re-balance |
| [Simulations](./judging/simulations.md) | Load simulations and what they found |

## Packages

| Document | Workspace | Role |
| --- | --- | --- |
| [API](./packages/api.md) | `@query/api` | tRPC routers, middleware, pricing |
| [Auth](./packages/auth.md) | `@query/auth` | NextAuth, providers, mailer |
| [Database](./packages/db.md) | `@query/db` | Drizzle schema, client, membership rules |
| [UI](./packages/ui.md) | `@query/ui` | Shared React components and styles |

## Sites

| Document | Workspace | Role |
| --- | --- | --- |
| [Main website](./sites/mainweb.md) | `web` | Public club site plus the authenticated portal |
| [Hacklytics 2027](./sites/hacklytics2027.md) | `hacklytics2027` | Static event marketing site |

## Tooling

Shared oxlint, Prettier, Tailwind, and TypeScript configs live under [`tooling/`](./tooling.md).
