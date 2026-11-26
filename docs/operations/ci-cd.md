# CI/CD

All workflows live in `.github/workflows/`.

## Pipeline

`ci.yml` is the one CI/CD pipeline, on every PR and every push to `main`/`dev`:

1. `check`, `test` and `build` run in parallel, so a run takes as long as the slowest rather than their sum. Each has its own checkout and `pnpm install --frozen-lockfile` (Node from `.nvmrc`; pnpm from `packageManager`, unpinned in the workflow so it cannot drift).
   - `check` — `turbo boundaries`, then `turbo run lint typecheck`.
   - `test` — `pnpm test` split in two with vitest `--shard`, each half on its own runner with its own database.
   - `build` — `turbo run build`, then uploads `sites/hacklytics2027/out` (artifact `hacklytics-out`).

   The archived `sites/hacklytics2026` is skipped: lint, typecheck and build run with `--filter=!hacklytics2026`, `vitest.config.ts` excludes its tests, and nothing uploads or deploys it.
2. `verify` — named `Lint, typecheck, test, build`. It waits for the three jobs above and fails unless every one succeeded, so a skipped or cancelled job cannot read as a pass. This is the check the branch rulesets require; keep the name.
3. `preview-hacklytics` — PRs from this repo (not forks, not Dependabot): deploys that build to Firebase Hosting channel `pr-N`.
4. `deploy-hacklytics` — push to `main` only: deploys the same build to the live `hacklytics` target.

### Caches

All three are `actions/cache`, so nothing outside GitHub storage. Each run saves under its own sha and restores the newest, so a PR starts from the last `main` or `dev` run.

| Job | Path | Key | Why |
| --- | --- | --- | --- |
| `check` | `.turbo/cache` | `turbo-lint-<os>-<sha>` | Lint, typecheck and the packages' build replay when their inputs did not change. A few hundred KB; entries older than a week are dropped before the save. |
| `build` | `sites/mainweb/public/photos` | hash of the source photos, `image-sizes.mjs` and `build-photos.ts` | Encoding the photos takes about 50s. No `restore-keys`: the restored files are touched so `build-photos.ts` sees them as fresh, which is only right for the exact same sources. |
| `build` | `sites/mainweb/.next/cache` | `next-<os>-<lockfile hash>-<sha>` | Turbopack's build cache. A build after a small change compiles in about 1s instead of 27s. |

`build` runs turbo with `--no-cache`. The mainweb build changes with almost every commit, and storing its output in `.turbo/cache` once grew that cache by about 57 MB per run, to 3.6 GB, which took 34s to restore and 14s to save. Env vars hash only into `mainweb`'s `build` (`sites/mainweb/turbo.json`) and `test`, never into lint or typecheck; the rest of the list in the root `turbo.json` is `globalPassThroughEnv`.

If a cached build ever looks wrong, change the key prefix in `ci.yml` (for example `next-` to `next-v2-`) to start from nothing.

Each `test` job starts the test database right after checkout, in the background, with only the `db` service (Mailpit is not used by tests). The image pull and boot then overlap install instead of adding about 30 seconds in front of the tests. The "Start test database" step waits for that start, then runs `pnpm local:up db` to push the schema and seed. In CI, `tooling/scripts/src/local.ts` also layers `docker/compose.ci.yml` on the compose file (fsync off, data on tmpfs); every compose call must use the same files or compose recreates the container.

Both deploy jobs `need` `verify`, so nothing ships that failed lint, typecheck, tests, or build.

## Security

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `codeql.yml` | Push/PR `main`/`dev`, daily 02:00 UTC | CodeQL `security-extended,security-and-quality`; PRs also run dependency review (`fail-on-severity: high`) |

Third-party actions (`pnpm/action-setup`, `FirebaseExtended/action-hosting-deploy`, `dependabot/fetch-metadata`) are pinned to a full commit SHA with the version in a trailing comment, because a tag can be moved to different code after review. Dependabot's GitHub Actions updates bump the SHA and the comment together. Actions owned by GitHub (`actions/*`, `github/*`) stay on major tags.

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
