# CI/CD

All workflows live in `.github/workflows/`.

## Pipeline

`ci.yml` is the one CI/CD pipeline, on every PR and every push to `main`/`dev`:

1. `verify` — `pnpm install --frozen-lockfile`, then `turbo run lint typecheck`, `pnpm test`, `turbo run build` (Node from `.nvmrc`; pnpm from `packageManager`, unpinned in the workflow so it cannot drift). Uploads `sites/hacklytics2027/out`.
2. `preview-hacklytics` — PRs from this repo (not forks, not Dependabot): deploys that build to Firebase Hosting channel `pr-N`.
3. `deploy-hacklytics` — push to `main` only: deploys the same build to the live `hacklytics` target.

Both deploy jobs `need` `verify`, so nothing ships that failed lint, typecheck, tests, or build.

## Security

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `codeql.yml` | Push/PR `main`/`dev`, daily 02:00 UTC | CodeQL `security-extended,security-and-quality`; PRs also run dependency review (`fail-on-severity: high`) |

## Mainweb deploy

Mainweb production is **Firebase App Hosting**, not `ci.yml`. App Hosting builds from `apphosting.yaml` when the connected branch updates, independent of whether `verify` passed — the gate is the `main` ruleset, so require the `Lint, typecheck, test, build` check there.

## Branch automation

| Workflow | Behavior |
| --- | --- |
| `feature-to-dev-pr.yml` | Push to any branch except `main`/`dev`/`dependabot/**` → open PR into `dev` (reviewer/assignee `aamoghS`) |
| `dev-to-main-pr.yml` | Push to `dev` → open PR into `main` |
| `sync-main-to-branches.yml` | Push to `main` (or manual) → merge `main` into `feature/*`, `fix/*`, `rework/*`, `refactor/*`, `hackaton/*` when fast-forwardable; skip conflicts |

`|| true` on `gh pr create` means a duplicate PR is not a failing job.

## Housekeeping

| Workflow / config | Behavior |
| --- | --- |
| `label.yml` | `pull_request_target` + `actions/labeler@v6` using `.github/labeler.yml` (branch prefixes + lockfile paths) |
| `dependabot.yml` | Weekly npm (root) and GitHub Actions |
| `dependabot-auto-merge.yml` | Comments `@dependabot merge` on non-major Dependabot PRs |
| `.github/pull.yml` | Additional pull-request automation config |

## Permissions

Deploy jobs need `contents: read` plus Hosting’s `pull-requests: write` / `checks: write` for preview comments. Branch-sync needs `contents: write`. CodeQL needs `security-events: write`.
