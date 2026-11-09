# Tooling

Shared configs under `tooling/`. Each is a workspace package consumed via `workspace:*`.

| Path | Package | Exports |
| --- | --- | --- |
| `tooling/oxlint` | `@query/oxlint-config` | None: packages `extends` `base.json`, `react.json`, `next.json` or `react-internal.json` by relative path |
| `tooling/prettier` | `@query/prettier-config` | `.` (`index.js`) — import sort + Tailwind plugin |
| `tooling/tailwind` | `@query/tailwind-config` | `.` (`shared-styles.css`), `./postcss` |
| `tooling/typescript` | `@query/tsconfig` | `./base.json`, `./nextjs.json`, `./internal-package.json` |

Each linted package has a `.oxlintrc.json`, and warnings fail the run. `base.json` also turns on type-aware rules, which need `oxlint-tsgolint`. `pnpm typecheck` runs `tsrs`, a Rust port of TypeScript 7, pinned exactly while it is in beta. `typescript` stays in place for `next build` and for emitting `@query/ui`.

## Turbo

Root `turbo.json` defines `build`, `dev`, `lint`, `typecheck`, `test`, `format`, `clean`, plus `push` / `studio` / `ui-add`. `globalEnv` lists secrets and tunables that must bust the cache when they change (database, auth, Stripe, email, DDoS, proxy hops).

`sites/mainweb/turbo.json` extends the root and sets Next `.next/**` build outputs.

`turbo/generators/` is a Plop generator (`init`) that scaffolds a new `packages/<name>` with oxlint, package.json, tsconfig, and `src/index.ts`.

## Other root files

| File | Role |
| --- | --- |
| `.nvmrc` | Node 24 |
| `pnpm-workspace.yaml` | Workspace globs, plus every pnpm setting: `overrides` (security pins), `allowBuilds`, `autoInstallPeers`, `publicHoistPattern` (hoists prettier), `frozenLockfile`. pnpm 12 reads settings only from here — not `.npmrc`, not `package.json`'s `pnpm` field |
| `restore-workspace.js` | Rewrite internal deps from `"*"` back to `workspace:*` |
| `.dockerignore` | Slim Docker context (docs, git, env files, `node_modules`) |
| `types/globals.d.ts` | Image module declarations (png/jpg/svg) |
| `.vscode/settings.json` | Quiet terminal bell; disable compile-hero on save |
