# Contributing

## Branching

Long-lived branches:

- `main` — production. App Hosting and Firebase Hosting deploys fire from here.
- `dev` — integration. Pushes open (or refresh) an automated PR into `main`.

Feature branches (anything other than `main`, `dev`, or `dependabot/**`) get an automated PR into `dev`. After `main` moves, `sync-main-to-branches.yml` merges `main` into `feature/*`, `fix/*`, `rework/*`, `refactor/*`, and `hackaton/*` when there is no conflict.

Name branches so [labeler](../.github/labeler.yml) can tag the PR: `feature/…`, `fix/…`, `docs/…`, `chore/…`.

Code owners: `.github/CODEOWNERS` assigns `*` to `@aamoghS`.

## Making changes

1. Branch from `dev` unless you are fixing production.
2. Keep club and hackathon concerns separate. Do not add `hackathon_id` to club tables.
3. Put shared rules in the package that every caller can import. Membership grant/link logic belongs in `@query/db/services/membership`, not copied into auth, Stripe, and tRPC.
4. Role checks go through `isAdmin` / `isScanner` / `isJudge` / `isProjectLeader` / `isSuperAdmin`. Do not invent an `adminProcedure` that is only `protectedProcedure`.
5. Dangerous HTML in tRPC input is **rejected**, not stripped. See [Security](./operations/security.md).
6. Prices live in `packages/api/src/services/pricing.ts`. Do not hard-code dollar amounts in UI or Stripe calls.

## Scripts

From the repo root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Lint is `--max-warnings 0`. Fix warnings rather than raising the cap.

Format:

```bash
pnpm format
```

## Tests

See [Testing](./operations/testing.md). At minimum, run `pnpm test` before opening a PR. API suites live next to routers and under `packages/api/src/.internal-tests/`.

Hacklytics end-to-end:

```bash
pnpm --filter hacklytics2027 e2e
```

## Never commit

Enable the hooks once per clone:

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-commit` refuses staged credentials, `.githooks/commit-msg`
refuses generated attribution lines, and `.gitignore` keeps both out of
`git add .` in the first place. What they cover:

- **Credentials** — `.env` and every variant, `*.pem`, `*.key`, `*.p12`,
  service-account JSON, ADC files, SSH keys. Secrets live in Secret Manager and
  are referenced from `apphosting.yaml` by name.
- **Key material pasted into ordinary files** — a private key block or a
  `sk_live_` / `whsec_` value in a config or fixture leaks exactly as much as
  the key file would. The Firebase *web* API key in `apphosting.yaml` is public
  and is not this.
- **`.claude/` and `.agents/`** — local agent tooling, shared with nobody. This
  repo's history was rewritten once to remove `.claude/`.
- **Attribution lines in commit messages** — no `Co-Authored-By: Claude`, no
  `Claude-Session:`, no `Generated with [Claude Code]`. They put a bot in this
  repo's GitHub contributor list.

`--no-verify` is there for a false positive, not for getting past a real one.

## Schema changes

1. Edit files in `packages/db/src/schemas/`.
2. `pnpm --filter @query/db migrate:push` against a database you are allowed to change.
3. `pnpm --filter @query/db db:check` confirms every declared column exists (this is the App Hosting build gate).
4. Prefer `migrate:generate` if you want reviewable SQL in `packages/db/drizzle/`.

Destructive changes abort on App Hosting because `drizzle-kit push` is fed `/dev/null` and cannot confirm. Plan those separately.

Unique indexes, cascade behavior, and “current hackathon” resolution have bitten this product before. Read the comments on the table you are touching.

## Workspace protocol

Internal packages use `workspace:*`. `restore-workspace.js` rewrites accidental `"*"` versions back to `workspace:*` if a tool flattened them.

## Issues

Use [`.github/ISSUE_TEMPLATE/bug_report.md`](../.github/ISSUE_TEMPLATE/bug_report.md) for bugs.
