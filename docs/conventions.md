# Repo conventions

What a coding agent needs on the first read. Each point links to the page that holds the detail. The repo MCP server (`tooling/mcp`, see [Tooling](./tooling.md#repo-mcp-server)) serves this page as its `conventions` tool, and answers the questions that change with the code (workspaces, tRPC procedures, tables, routes) from the source itself rather than from a copy.

## Branch flow

- `main` is production. Firebase App Hosting builds and deploys mainweb from it, and a push to `main` deploys the Hacklytics sites to Firebase Hosting.
- `dev` is integration. A push to `dev` opens or refreshes an automated PR into `main`.
- Any other branch except `dependabot/**` gets an automated PR into `dev`. Branch from `dev` unless fixing production, and name the branch `feature/…`, `fix/…`, `docs/…` or `chore/…` so the labeler tags the PR.
- After `main` moves, `sync-main-to-branches.yml` merges it into `feature/*`, `fix/*`, `rework/*`, `refactor/*` and `hackaton/*` when there is no conflict.
- App Hosting does not wait for CI. The gate is the `main` ruleset requiring the `Lint, typecheck, test, build` check.

Detail: [Contributing](./contributing.md#branching), [CI/CD](./operations/ci-cd.md), [Deployment](./operations/deployment.md).

## Never commit

Run `git config core.hooksPath .githooks` once per clone. `pre-commit` refuses credentials (`.env` files, keys, service-account JSON) and key material pasted into ordinary files, and refuses anything under `.claude/` or `.agents/`. `commit-msg` refuses attribution lines such as `Co-Authored-By: Claude` or `Generated with [Claude Code]`. Details: [Contributing](./contributing.md#never-commit).

## Version

`sites/mainweb/next.config.mjs` stamps each build `MAJOR.MINOR.PATCH` and shows it at `/api/ping`.

- `MAJOR.MINOR` is the `version` field in `sites/mainweb/package.json`. Every other `package.json` in the repo carries the same version, `MAJOR.MINOR.0`. Change them together with `pnpm version:set <version>` in a PR; a test fails if one differs.
- `PATCH` is the number of merges into `main` since that line last changed. At 100 it rolls into `MINOR`.
- The history table (3.0 onward) is in [Tooling](./tooling.md#version-history). Add a row when a release is worth naming.

## Dependencies and pnpm

pnpm `12.18.0` and Node `>=24.11.0 <25` (`.nvmrc` is `24`). All pnpm settings live in `pnpm-workspace.yaml`; pnpm 12 reads none from `.npmrc` or `package.json`.

- Workspaces are `sites/*`, `packages/*` and `tooling/*`. Internal dependencies use `workspace:*`; `node tooling/scripts/src/restore-workspace.ts` repairs any a tool flattened to `"*"`.
- A version that two or more workspaces use lives once in the `catalog:` block, and packages write `"catalog:"`. Add new shared dependencies there.
- `overrides:` holds security pins. `allowBuilds:` records each dependency build script as allowed or not, because pnpm 11+ fails an install on an unreviewed one.
- CI installs with `--frozen-lockfile`, so commit `pnpm-lock.yaml` with any dependency change.

## Turbo tasks

From the root: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Lint, typecheck and build go through `turbo run`; `pnpm test` runs `vitest run` from the root `vitest.config.ts`, after the local-database guard. `turbo run test` runs each package's own `test` script.

- `build`, `lint` and `typecheck` depend on `^build`, so a package builds after what it depends on.
- Filter to one workspace with `--filter=<name>`, for example `pnpm turbo run typecheck --filter=@query/api`.
- CI (`verify` in `ci.yml`) runs `turbo run lint typecheck`, then `pnpm test`, then `turbo run build`. `pnpm test` alone does not lint, typecheck or build.

## Tests and the database

Tests that need Postgres use a disposable local database, never production or Neon. `pnpm local:up` starts the compose Postgres and Mailpit, pushes the schema and seeds fake data. Most suites mock the database and need none.

`tooling/scripts/src/guard-local.ts` runs before `pnpm test`, `migrate:push`, the seed scripts and `pnpm local:up`. It refuses a `DATABASE_URL` that is not `localhost`, `127.0.0.1`, `::1`, `db` or `postgres`, refuses Stripe live keys outside production, and passes when `DATABASE_URL` is unset. `ALLOW_NON_LOCAL_SERVICES=1` waives the database and email checks; an agent should not set it.

Detail: [Testing](./operations/testing.md), [Getting started](./getting-started.md#local-test-environment-one-command).

## Lint and format

- Lint is oxlint, configured per workspace in `oxlint.config.mts` from `@query/oxlint-config`. Warnings fail the run, and the type-aware rules need `oxlint-tsgolint`. Fix warnings rather than raising a cap.
- Typecheck is `tsrs --noEmit`, a Rust port of TypeScript 7 pinned exactly while it is in beta.
- Format is Prettier through `@query/prettier-config`, which sorts imports and orders Tailwind classes. `pnpm format` writes; `prettier --check <files>` checks.

## Rules that have bitten before

- Role checks go through `isAdmin`, `isScanner`, `isProjectLeader` or `isSuperAdmin`. Do not add an `adminProcedure` that is only `protectedProcedure`.
- Dangerous HTML in tRPC input is rejected, not stripped. See [Security](./operations/security.md).
- Prices live in `packages/api/src/services/pricing.ts`.
- Keep club and hackathon tables apart. Do not add `hackathon_id` to a club table.
- Shared rules go in the package every caller can import, for example membership logic in `@query/db/services/membership`.
- Package layers are enforced by `boundaries` in `turbo.json`. See [Architecture](./architecture.md).

## Schema changes

Edit `packages/db/src/schemas/`, then `pnpm --filter @query/db migrate:push` against a database you may change, and `pnpm --filter @query/db db:check`. Destructive changes abort on App Hosting, so plan them separately. Read the comments on the table you touch. See [Contributing](./contributing.md#schema-changes).

## Where things live

| Looking for                                         | Look in                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Public site and member portal pages, route handlers | `sites/mainweb/app` (Next.js App Router; `(portal)` and `(auth)` are route groups)        |
| tRPC routers, middleware, pricing                   | `packages/api/src` (`root.ts` assembles `appRouter`; roles in `middleware/procedures.ts`) |
| Auth (NextAuth, email codes)                        | `packages/auth`                                                                           |
| Drizzle schema, client, membership rules            | `packages/db/src`                                                                         |
| Org, site and time constants                        | `packages/core`                                                                           |
| Design system                                       | `packages/ui`                                                                             |
| Hacklytics editions and the shared kit              | `sites/hacklytics2027`, `sites/hacklytics2026`, `packages/event-kit`                      |
| Shared lint, format and TypeScript configs          | `tooling/oxlint`, `tooling/prettier`, `tooling/typescript`                                |
| Repo scripts (local stack, guard, uptime probe)     | `tooling/scripts/src`                                                                     |
| Repo MCP server                                     | `tooling/mcp`                                                                             |
| Workflows                                           | `.github/workflows`                                                                       |
| Documentation                                       | `docs/`, indexed in [Documentation](./README.md)                                          |

For the live lists, use the MCP tools: `workspace`, `api_procedures`, `db_schema` and `routes`. To find or follow code without reading whole files, use `code_symbol`, `code_outline`, `code_deps` and `code_impact`.
