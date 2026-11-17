# Tooling

Shared configs under `tooling/`. Each is a workspace package consumed via `workspace:*`.

| Path | Package | Exports |
| --- | --- | --- |
| `tooling/oxlint` | `@query/oxlint-config` | None: packages `extends` `base.json`, `react.json`, `next.json` or `react-internal.json` by relative path |
| `tooling/prettier` | `@query/prettier-config` | `.` (`index.js`) — import sort + Tailwind plugin |
| `tooling/tailwind` | `@query/tailwind-config` | `.` (`shared-styles.css`), `./postcss` |
| `tooling/typescript` | `@query/tsconfig` | `./base.json`, `./nextjs.json`, `./internal-package.json` |

Each linted package has a `.oxlintrc.json`, and warnings fail the run. `base.json` also turns on type-aware rules, which need `oxlint-tsgolint`. `pnpm typecheck` runs `tsrs`, a Rust port of TypeScript 7, pinned exactly while it is in beta. `typescript` stays in place for `next build`.

## Turbo

Root `turbo.json` defines `build`, `dev`, `lint`, `typecheck`, `test`, `format`, `clean`, plus `push` / `studio` / `ui-add`. `globalPassThroughEnv` hands secrets and tunables (database, auth, Stripe, email, DDoS, proxy hops) to every task without hashing them, so changing one does not bust the cache. `test` hashes `DATABASE_URL` on its own.

`sites/mainweb/turbo.json` extends the root and sets Next `.next/**` build outputs.

`turbo/generators/` is a Plop generator (`init`) that scaffolds a new `packages/<name>` with oxlint, package.json, tsconfig, and `src/index.ts`. Run it with `pnpm turbo gen init`.

`tooling/scripts/src/restore-workspace.ts` rewrites internal deps a tool flattened to `"*"` back to `workspace:*`. Run it from the repo root with `node tooling/scripts/src/restore-workspace.ts`.

## Build version

`sites/mainweb/next.config.mjs` stamps every build with `NEXT_PUBLIC_APP_VERSION`: `<major>.<minor>` from `sites/mainweb/package.json`, then the git commit count, then the short SHA (`1.0.812+abc1234`). A build without git history falls back to `<package version>+<UTC timestamp>`. `/api/ping` returns it, so `curl https://datasciencegt.org/api/ping` shows what is live. Bump `major.minor` in `sites/mainweb/package.json` by hand for a release worth naming; the patch moves on its own. A turbo cache hit replays the stamp of the build it cached, which is the same code.

## Other root files

| File | Role |
| --- | --- |
| `.nvmrc` | Node 24 |
| `pnpm-workspace.yaml` | Workspace globs, the `catalog` of shared dependency versions (packages use `"catalog:"`), plus every pnpm setting: `overrides` (security pins), `allowBuilds`, `autoInstallPeers`, `publicHoistPattern` (hoists prettier), `frozenLockfile`. pnpm 12 reads settings only from here — not `.npmrc`, not `package.json`'s `pnpm` field |
| `.dockerignore` | Slim Docker context (docs, git, env files, `node_modules`) |
| `.vscode/settings.json` | Quiet terminal bell; disable compile-hero on save |
