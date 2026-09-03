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

## Packages

| Document | Workspace | Role |
| --- | --- | --- |
| [API](./packages/api.md) | `@query/api` | tRPC routers, middleware, pricing |
| [Auth](./packages/auth.md) | `@query/auth` | NextAuth, providers, mailer |
| [Database](./packages/db.md) | `@query/db` | Drizzle schema, client, membership rules |
| [UI](./packages/ui.md) | `@query/ui` | Shared React components and styles |

## Apps

| Document | Workspace | Role |
| --- | --- | --- |
| [dsgt Slack bot](../apps/dsgt-slack/README.md) | `@query/dsgt-slack` | `@dsgt` Slack bot; production HTTP on mainweb |

## Sites

| Document | Workspace | Role |
| --- | --- | --- |
| [Main website](./sites/mainweb.md) | `web` | Public club site plus the authenticated portal |
| [Hacklytics 2027](./sites/hacklytics2027.md) | `hacklytics2027` | Static event marketing site |

## Tooling

Shared ESLint, Prettier, Tailwind, and TypeScript configs live under [`tooling/`](./tooling.md).
