# CI/CD

All workflows live in `.github/workflows/`.

## Quality

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `pnpm-ci.yml` | Push `main`/`dev`, PRs | `pnpm install` + `pnpm turbo run build` (Node 22) |
| `test.yml` | Push `main`/`dev`, PRs | `pnpm test` (Node 20; pnpm comes from `packageManager`, unpinned in the workflow so it cannot drift) |
| `codeql.yml` | Push/PR `main`/`dev`, daily 02:00 UTC | CodeQL `security-extended,security-and-quality`; PRs also run dependency review (`fail-on-severity: high`) |

## Deploy

| Workflow | Trigger | Target |
| --- | --- | --- |
| `deploy-hacklytics.yml` | Push `main` and PRs | Firebase Hosting `hacklytics` (live vs `pr-N`) |
| `firebase-hosting-merge.yml` | Push `main` | Same live Hacklytics deploy |
| `firebase-hosting-pull-request.yml` | PRs (same-repo only) | Hacklytics preview channel |

Mainweb production is **Firebase App Hosting**, not these Hosting workflows. App Hosting builds from `apphosting.yaml` when the connected branch updates.

`deploy-hacklytics.yml.disabled` is a leftover disabled copy.

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
