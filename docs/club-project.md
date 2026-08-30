# Club project: DS@GT website

This is the member-facing overview of **query**, the live public website and member portal for [Data Science at Georgia Tech](https://datasciencegt.org) (DS@GT / DSGT). <!-- pragma: allowlist secret -->

It is not a setup manual. Local install is [Getting started](./getting-started.md). Pull requests and review rules are [Contributing](./contributing.md). Architecture, packages, and operations stay in the rest of [`docs/`](./README.md).

Aamogh Sawant ([@aamoghS](https://github.com/aamoghS)), club President, owns and ships this repo. There is no separate website lead.

## What this is

The public website visitors see, and the signed-in portal members use to join the club, pay dues, check in at events, follow bootcamp, apply to initiatives, and handle Hacklytics interest and registration.

The public pages and the portal are one Next.js app (`sites/mainweb`). Signing in does not take you to a different hostname.

## Live URLs

| Surface | URL |
| --- | --- |
| Public site + portal | [https://datasciencegt.org](https://datasciencegt.org) <!-- pragma: allowlist secret --> |
| Sign in | [https://datasciencegt.org/login](https://datasciencegt.org/login) <!-- pragma: allowlist secret --> |
| Member home | [https://datasciencegt.org/dashboard](https://datasciencegt.org/dashboard) <!-- pragma: allowlist secret --> |

`member.datasciencegt.org` does **not** resolve. Do not send people there, and do not put it in copy or onboarding.

Locally, the same app is [http://localhost:3001](http://localhost:3001). See [Getting started](./getting-started.md).

## What members use it for

After sign-in (Google, GitHub if configured, or email code):

| Need | Where |
| --- | --- |
| Join / pay dues | Portal membership — Stripe **$25** annual membership, **$10** bootcamp add-on (on top of membership, not instead of it) |
| Club events and check-in | Portal events / club pass |
| Bootcamp (term-gated add-on) | `/club/bootcamp` and the public `/bootcamp` page |
| Initiatives (club projects you apply to) | `/initiatives` |
| Staff tools | `/admin` (appointed roles only; there is no public admin signup) |
| Hacklytics interest and registration | Portal `/hacklytics` (the marketing site links here after login) |

Hacklytics participation is open to non-members. A paid membership is not required to register for the hackathon.

Public pages (no login):

| Path | Page |
| --- | --- |
| `/` | Home |
| `/team` | Executive board |
| `/events` | Public events |
| `/projects` | Projects |
| `/history` | Club history |
| `/bootcamp` | Bootcamp marketing |

Route-level detail: [Main website](./sites/mainweb.md). Club vs hackathon vocabulary: [Glossary](./glossary.md).

## Current status (Fall 2026)

This is **live production infrastructure**, not a greenfield student app and not a class project waiting for a first deploy.

- Serving real members at [datasciencegt.org](https://datasciencegt.org) <!-- pragma: allowlist secret -->
- Hosted on Firebase App Hosting / Cloud Run
- GCP project: `dsgt-website`
- Database: Neon (Postgres)
- Last `main` activity: late August 2026

Treat production as production. A broken PR can take down dues, login, or event check-in.

## How the repo is laid out

High level only. Details live in the linked docs.

| Path | What it is |
| --- | --- |
| `sites/mainweb` | Public club site **and** the authenticated portal |
| `sites/hacklytics2027` | Hacklytics 2027 marketing site (static; no database) |
| `packages/api` | tRPC, pricing, server logic |
| `packages/auth` | Sign-in (NextAuth) |
| `packages/db` | Schema and membership rules |
| `packages/ui` | Shared React components |

Club operations (membership, club events, bootcamp, initiatives) and hackathon editions share one database but are modeled as separate domains. Do not hang club tables off a hackathon row.

Setup, env, and first-admin bootstrap: [Getting started](./getting-started.md). How the pieces connect: [Architecture](./architecture.md). Index of the rest: [Documentation](./README.md).

## Older repos (do not revive)

These are predecessors. The live product is **this** repo (`DataScience-GT/query`). Do not open feature work there, do not migrate traffic back, and do not treat them as the current stack.

| Repo | What it was |
| --- | --- |
| [DataScience-GT/datascience-gt.github.io](https://github.com/DataScience-GT/datascience-gt.github.io) | Earlier website / portal repo |
| [DataScience-GT/dsgt-member-portal](https://github.com/DataScience-GT/dsgt-member-portal) | Earlier member portal (membership, Stripe, events) |

## How to help

Safe first work — useful, visible, and hard to take production down with:

1. **Public content accuracy** — `/team`, `/projects`, `/events` (and related copy) matching the current board and programs
2. **Onboarding and docs** — this folder, especially anything that helps a new contributor run the app without guessing
3. **Small UI bugs** — layout, dead links, copy, accessibility on pages you can exercise locally
4. **Tests** — fill gaps in existing Vitest suites; see [Testing](./operations/testing.md)

Label anything that touches **payments**, **auth**, or **production deploy** as **needs-exec-review**. Do not merge that class of change on a student PR alone. That includes Stripe amounts and webhooks, NextAuth / OAuth / email-code login, secrets, `apphosting.yaml`, Firebase Hosting, and anything that writes production schema.

Club events and working time are after **6:30 PM ET**. Questions: [hello@datasciencegt.org](mailto:hello@datasciencegt.org) or Aamogh.

## How to join / contribute

1. Read [Contributing](./contributing.md) and [Getting started](./getting-started.md).
2. Branch from `dev` (that is the integration branch). `main` is production.
3. Open the pull request against **this** repo (`DataScience-GT/query`). Feature branches are reviewed into `dev`; `dev` is what ships to `main`.
4. Never commit secrets (`.env`, Stripe keys, OAuth client secrets, SMTP passwords, production `DATABASE_URL`). If a secret was pasted into a PR, say so immediately — do not “fix” it by committing a deletion and moving on.

Code owners: `@aamoghS`.
