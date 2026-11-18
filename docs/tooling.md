# Tooling

Shared configs under `tooling/`. Each is a workspace package consumed via `workspace:*`.

| Path | Package | Exports |
| --- | --- | --- |
| `tooling/oxlint` | `@query/oxlint-config` | None: packages `extends` `base.json`, `react.json`, `next.json` or `react-internal.json` by relative path |
| `tooling/prettier` | `@query/prettier-config` | `.` (`index.js`) — import sort + Tailwind plugin |
| `tooling/typescript` | `@query/tsconfig` | `./base.json` |

Each linted package has a `.oxlintrc.json`, and warnings fail the run. `base.json` also turns on type-aware rules, which need `oxlint-tsgolint`. `pnpm typecheck` runs `tsrs`, a Rust port of TypeScript 7, pinned exactly while it is in beta. `typescript` stays in place for `next build`.

## Turbo

Root `turbo.json` defines `build`, `dev`, `lint`, `typecheck`, `test`, `format`, `clean`, plus `push` / `studio` / `ui-add`. `globalPassThroughEnv` hands secrets and tunables (database, auth, Stripe, email, DDoS, proxy hops) to every task without hashing them, so changing one does not bust the cache. `test` hashes `DATABASE_URL` on its own.

`sites/mainweb/turbo.json` extends the root and sets Next `.next/**` build outputs.

`turbo/generators/` is a Plop generator (`init`) that scaffolds a new `packages/<name>` with oxlint, package.json, tsconfig, and `src/index.ts`. Run it with `pnpm turbo gen init`.

`tooling/scripts/src/restore-workspace.ts` rewrites internal deps a tool flattened to `"*"` back to `workspace:*`. Run it from the repo root with `node tooling/scripts/src/restore-workspace.ts`.

## Build version

`sites/mainweb/next.config.mjs` stamps every build with `NEXT_PUBLIC_APP_VERSION` as `MAJOR.MINOR.PATCH`, and with the short SHA as `NEXT_PUBLIC_APP_COMMIT`. `/api/ping` returns both, so `curl https://datasciencegt.org/api/ping` shows what is live.

- `MAJOR.MINOR` come from `version` in `sites/mainweb/package.json`, set by hand.
- `PATCH` is the number of merges into `main` since that `version` line last changed, so each deploy adds one. At 100 it rolls into `MINOR` (`3.4.99` is followed by `3.5.0`), so the patch is never more than two digits.
- App Hosting clones with depth 1, which has no history to count. The config detects a shallow clone and runs `git fetch --unshallow` against the public repo first, which adds about 15 seconds to the build.
- A build with no git at all reports the `package.json` version as is.
- A turbo cache hit replays the version of the build it cached, which is the same code.

To ship a release worth naming, change `version` in `sites/mainweb/package.json` (for example to `4.0.0`) in a PR. The patch restarts from that commit.

### Version history

The versions before 3.4 were assigned after the fact, from the repo history.

| Version | Since | What changed |
| --- | --- | --- |
| 1.x | 2025-06 | Single Next.js club site |
| 2.x | 2025-12 | pnpm and turbo monorepo with `db`, `auth`, `api`; live on App Hosting with Stripe in 2026-01 |
| 3.0 | 2026-02 | Member portal: login, dashboards, admin, judge |
| 3.1 | 2026-03 | Hacklytics 2027 event site |
| 3.2 | 2026-05 | Public status page |
| 3.3 | 2026-08 | Docs and the vitest suite |
| 3.4 | 2026-10 | Judging scheduler (CP-SAT) |

## Other root files

| File | Role |
| --- | --- |
| `.nvmrc` | Node 24 |
| `pnpm-workspace.yaml` | Workspace globs, the `catalog` of shared dependency versions (packages use `"catalog:"`), plus every pnpm setting: `overrides` (security pins), `allowBuilds`, `autoInstallPeers`, `publicHoistPattern` (hoists prettier), `frozenLockfile`. pnpm 12 reads settings only from here — not `.npmrc`, not `package.json`'s `pnpm` field |
| `.dockerignore` | Slim Docker context (docs, git, env files, `node_modules`) |
| `.vscode/settings.json` | Quiet terminal bell; disable compile-hero on save |
