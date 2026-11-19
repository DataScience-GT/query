# Tooling

Shared configs under `tooling/`. Each is a workspace package consumed via `workspace:*`.

| Path | Package | Exports |
| --- | --- | --- |
| `tooling/oxlint` | `@query/oxlint-config` | `./base.json`, `./react.json`, `./next.json`, `./react-internal.json`, imported by package name from each workspace's `oxlint.config.mts` |
| `tooling/prettier` | `@query/prettier-config` | `.` (`index.js`) — import sort + Tailwind plugin |
| `tooling/typescript` | `@query/tsconfig` | `./base.json` |
| `tooling/mcp` | `@query/mcp` | A stdio MCP server for coding agents, see [Repo MCP server](#repo-mcp-server). Not a config package |

Each linted package has an `oxlint.config.mts`, and warnings fail the run. `base.json` also turns on type-aware rules, which need `oxlint-tsgolint`. `pnpm typecheck` runs `tsrs`, a Rust port of TypeScript 7, pinned exactly while it is in beta. `typescript` stays in place for `next build`.

## Turbo

Root `turbo.json` defines `build`, `dev`, `lint`, `typecheck`, `test`, `format`, `clean`, plus `push` / `studio` / `ui-add`. `globalPassThroughEnv` hands secrets and tunables (database, auth, Stripe, email, DDoS, proxy hops) to every task without hashing them, so changing one does not bust the cache. `test` hashes `DATABASE_URL` on its own.

`sites/mainweb/turbo.json` extends the root and sets Next `.next/**` build outputs.

`turbo/generators/` holds two Plop generators. `init` scaffolds a new `packages/<name>` with oxlint, package.json, tsconfig, and `src/index.ts`. Run it with `pnpm turbo gen init`. `hacklytics` scaffolds a Hacklytics edition site on the event kit and wires its deploy. Run it with `pnpm turbo gen hacklytics`, see [Starting a new edition](./sites/new-edition.md).

`tooling/scripts/src/restore-workspace.ts` rewrites internal deps a tool flattened to `"*"` back to `workspace:*`. Run it from the repo root with `node tooling/scripts/src/restore-workspace.ts`.

## Repo MCP server

`tooling/mcp` is an [MCP](https://modelcontextprotocol.io) server that answers a coding agent's questions about this repo from the source, so the answers are as current as the working tree. The root `.mcp.json` registers it for Claude Code as `query`; other MCP clients can run `node tooling/mcp/src/server.ts` from the repo root. It runs the TypeScript directly with Node's type stripping, like `tooling/scripts`, so there is no build step.

| Tool | Answers |
| --- | --- |
| `workspace` | Every workspace: path, scripts, internal dependencies and dependents |
| `docs_search`, `docs_read` | Search and read `docs/**`, the root README and CONTRIBUTING, and package READMEs |
| `api_procedures` | tRPC procedures from `packages/api`: query or mutation, `isAdmin` / `protectedProcedure` / ..., file and line. Optional router prefix |
| `db_schema` | Drizzle tables and columns from `packages/db`. Optional table |
| `routes` | mainweb App Router URLs, route groups, handlers and client pages |
| `code_symbol` | Where a function, component, const, type or tRPC router is defined, as `file:line` with its signature. Exact, prefix or substring match |
| `code_outline` | A file's resolved imports and top-level declarations with line ranges, instead of its body |
| `code_deps` | What a file imports, or what imports it, to depth 3. Resolves relative paths, `@/` and workspace package names through each `package.json` `exports`. External packages are listed, not expanded |
| `code_impact` | Transitive importers of a file or exported symbol by workspace, and the mainweb routes (page, layout, route handler, client or server) that reach it |
| `conventions` | [Conventions](./conventions.md) |
| `run_check` | `pnpm turbo run lint`, `typecheck`, `test` or `build`, optionally for one workspace. `test` and `build` refuse a `DATABASE_URL` or `TEST_DATABASE_URL` that is not local |

The code tools build a graph of `sites/`, `packages/` and `tooling/` with `@babel/parser` (TypeScript 7 has no JavaScript API), keep it in memory, and re-read only the files whose mtime changed. The first call parses every file, about 5 to 10 seconds. After that a call costs a directory walk, a fraction of a second. `graphify-out/` is a separate prebuilt graph from another tool, not used here and not updated with the code.

All but `run_check` only read files. The readers scan the source text rather than importing it, so they need no database or environment, and a change to how routers or schemas are written may need a matching change in `tooling/mcp/src`. Its tests run the readers against the repo and fail when they drift.

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
| 3.5 | 2026-11 | Monorepo restructure: enforced package layers, `@query/core`, the `@query/event-kit` Hacklytics kit and `pnpm turbo gen hacklytics` |
| 3.6 | 2026-11 | Lighter portal: judging console and desk load on demand, sign-in and error pages skip the portal data stack, the sidebar nav is drawn on the server |

## Other root files

| File | Role |
| --- | --- |
| `.nvmrc` | Node 24 |
| `pnpm-workspace.yaml` | Workspace globs, the `catalog` of shared dependency versions (packages use `"catalog:"`), plus every pnpm setting: `overrides` (security pins), `allowBuilds`, `autoInstallPeers`, `publicHoistPattern` (hoists prettier), `frozenLockfile`. pnpm 12 reads settings only from here — not `.npmrc`, not `package.json`'s `pnpm` field |
| `.dockerignore` | Slim Docker context (docs, git, env files, `node_modules`) |
| `.vscode/settings.json` | Quiet terminal bell; disable compile-hero on save |
