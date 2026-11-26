# CI/CD

All workflows live in `.github/workflows/`.

## Pipeline

`ci.yml` is the one CI/CD pipeline, on every PR and every push to `main`/`dev`:

1. `verify` — `bun install --frozen-lockfile`, then `turbo run lint typecheck`, `bun run test`, `turbo run build` (Node from `.nvmrc`; Bun pinned in the workflow). Uploads `sites/hacklytics2027/out` (artifact `hacklytics-out`). The archived `sites/hacklytics2026` is skipped: lint, typecheck and build run with `--filter=!hacklytics2026`, `vitest.config.ts` excludes its tests, and nothing uploads or deploys it.
2. `preview-hacklytics` — PRs from this repo (not forks, not Dependabot): deploys that build to Firebase Hosting channel `pr-N`.
3. `deploy-hacklytics` — push to `main` only: deploys the same build to the live `hacklytics` target.

`verify` restores `.turbo/cache` with `actions/cache`, keyed by commit sha and restored from the newest run, so unchanged tasks replay from cache. Env vars hash only into `mainweb`'s `build` (`sites/mainweb/turbo.json`) and `test`, never into lint or typecheck; the rest of the list in the root `turbo.json` is `globalPassThroughEnv`.

`verify` starts the test database right after checkout, in the background, with only the `db` service (Mailpit is not used by tests). The image pull and boot then overlap install and lint/typecheck instead of adding about 30 seconds in front of the tests. The "Start test database" step waits for that start, then runs `bun run local:up db` to push the schema and seed. In CI, `tooling/scripts/src/local.ts` also layers `docker/compose.ci.yml` on the compose file (fsync off, data on tmpfs); every compose call must use the same files or compose recreates the container.

Both deploy jobs `need` `verify`, so nothing ships that failed lint, typecheck, tests, or build.

### Bun in CI, pnpm in production

CI installs and runs scripts with Bun. Firebase App Hosting still builds with pnpm (`packageManager`, `apphosting.yaml`), and `pnpm-lock.yaml` stays the one lockfile: Dependabot and humans update it with pnpm, and no `bun.lock` is committed. With only `pnpm-lock.yaml` present, `bun install --frozen-lockfile` migrates it in memory (versions, integrity hashes, `catalog:`, `overrides`, `patchedDependencies`) and installs from that.

- `tooling/scripts/src/install-parity.ts` runs right after the install and fails the job if Bun's `node_modules` differs from what pnpm would install from `pnpm-lock.yaml` on that machine: any package or version, which version each package and workspace links, and any patch not applied. Run it locally the same way after `bun install`.
- Scripts run on Node 24, not Bun's runtime. Never add `bun --bun` to a CI step: it would test on a runtime production does not use.
- `packageManager` stays `pnpm`, so turbo runs each task as `pnpm run <script>`. A real pnpm would reinstall over Bun's `node_modules`, so a step puts a `pnpm` on `PATH` that only forwards `run` to `bun run`. Anything else it is asked fails loudly. Scripts that call `pnpm` themselves must use `pnpm run <script>` run from the package folder, not `pnpm --filter`: `bun run --filter` finds no workspaces in a pnpm repo.
- `publish-packages.yml` stays on pnpm. It ships a tarball, and `pnpm publish` is the packer that rewrites `workspace:` ranges, so a release should not change with CI. The CodeQL job installs through Bun the same way as `verify`.
- Bun ignores pnpm's `publicHoistPattern`, so `bun run prettier` is not available from the root. CI does not format.
- Keep updating the lockfile with `pnpm install`. A plain `bun install` here writes a `bun.lock` and edits `package.json` (it adds `workspaces` and `overrides`); if a `bun.lock` were committed, Bun would install from it instead of `pnpm-lock.yaml`, and the parity check would fail. `bun install --frozen-lockfile` writes nothing.
- Bun does not read `minimumReleaseAge` or `allowBuilds` from `pnpm-workspace.yaml`. Neither matters here: the frozen install resolves nothing, and `--ignore-scripts` stands in for `allowBuilds`.

## Security

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `codeql.yml` | Push/PR `main`/`dev`, daily 02:00 UTC | CodeQL `security-extended,security-and-quality`; PRs also run dependency review (`fail-on-severity: high`) |

Third-party actions (`pnpm/action-setup`, `oven-sh/setup-bun`, `FirebaseExtended/action-hosting-deploy`, `dependabot/fetch-metadata`) are pinned to a full commit SHA with the version in a trailing comment, because a tag can be moved to different code after review. Dependabot's GitHub Actions updates bump the SHA and the comment together. Actions owned by GitHub (`actions/*`, `github/*`) stay on major tags.

## Mainweb deploy

Mainweb production is **Firebase App Hosting**, not `ci.yml`. App Hosting builds from `apphosting.yaml` when the connected branch updates, independent of whether `verify` passed — the gate is the `main` ruleset, so require the `Lint, typecheck, test, build` check there.

## Branch automation

| Workflow | Behavior |
| --- | --- |
| `feature-to-dev-pr.yml` | Push to any branch except `main`/`dev`/`dependabot/**` → open PR into `dev` (reviewer/assignee `aamoghS`) |
| `dev-to-main-pr.yml` | Push to `dev` → open PR into `main` |
| `sync-main-to-branches.yml` | Push to `main` (or manual) → merge `main` into `feature/*`, `fix/*`, `rework/*`, `refactor/*`, `hackaton/*` when fast-forwardable; skip conflicts |

`|| true` on `gh pr create` means a duplicate PR is not a failing job.

## Uptime probe

| Workflow | Behavior |
| --- | --- |
| `uptime.yml` | Every 5 minutes (and manual): probes `/api/ping` from outside, then force-pushes a single orphan commit holding `uptime.json` to the `status-data` branch, which `/status` reads. One run at a time (`concurrency: uptime`). Scheduled runs can lag 5 to 15 minutes. See [Status page](../features/status.md#the-external-probe) |

`status-data` is excluded from `feature-to-dev-pr.yml` so the data branch never gets a PR.

## Housekeeping

| Workflow / config | Behavior |
| --- | --- |
| `label.yml` | `pull_request_target` + `actions/labeler@v6` using `.github/labeler.yml` (branch prefixes + lockfile paths) |
| `dependabot.yml` | Weekly npm (root) and GitHub Actions |
| `dependabot-auto-merge.yml` | Comments `@dependabot merge` on non-major Dependabot PRs |
| `.github/pull.yml` | Additional pull-request automation config |

## Permissions

Deploy jobs need `contents: read` plus Hosting’s `pull-requests: write` / `checks: write` for preview comments. Branch-sync and the uptime probe need `contents: write`. CodeQL needs `security-events: write`.
