# Tooling

Shared configs under `tooling/`. Each is a workspace package consumed via `workspace:*`.

| Path | Package | Exports |
| --- | --- | --- |
| `tooling/eslint` | `@query/eslint-config` | `./base`, `./next-js`, `./react`, `./react-internal` |
| `tooling/prettier` | `@query/prettier-config` | `.` (`index.js`) — import sort + Tailwind plugin |
| `tooling/tailwind` | `@query/tailwind-config` | `.` (`shared-styles.css`), `./postcss` |
| `tooling/typescript` | `@query/tsconfig` | `./base.json`, `./nextjs.json`, `./internal-package.json` |

ESLint in app packages is `--max-warnings 0`.

## Turbo

Root `turbo.json` defines `build`, `dev`, `lint`, `typecheck`, `test`, `format`, `clean`, plus `push` / `studio` / `ui-add`. `globalEnv` lists secrets and tunables that must bust the cache when they change (database, auth, Stripe, email, DDoS, proxy hops).

`sites/mainweb/turbo.json` extends the root and sets Next `.next/**` build outputs.

`turbo/generators/` is a Plop generator (`init`) that scaffolds a new `packages/<name>` with eslint, package.json, tsconfig, and `src/index.ts`.

## Other root files

| File | Role |
| --- | --- |
| `.nvmrc` | Node 20 |
| `pnpm-workspace.yaml` | Workspace globs, plus every pnpm setting: `overrides` (security pins), `allowBuilds`, `autoInstallPeers`, `publicHoistPattern` (hoists eslint/prettier), `frozenLockfile`. pnpm 12 reads settings only from here — not `.npmrc`, not `package.json`'s `pnpm` field |
| `restore-workspace.js` | Rewrite internal deps from `"*"` back to `workspace:*` |
| `.dockerignore` | Slim Docker context (docs, git, env files, `node_modules`) |
| `types/globals.d.ts` | Image module declarations (png/jpg/svg) |
| `.vscode/settings.json` | Quiet terminal bell; disable compile-hero on save |
