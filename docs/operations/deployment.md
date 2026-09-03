# Deployment

Two surfaces, two platforms.

## Main website — Firebase App Hosting

Config: [`apphosting.yaml`](../../apphosting.yaml) at the repo root.

| | |
| --- | --- |
| App | `sites/mainweb` (workspace `web`) |
| Runtime | Node 20 |
| Output | Next standalone (`sites/mainweb/.next/standalone/sites/mainweb/server.js`) |
| Concurrency | 80 |
| CPU / memory | 2 / 1024 MiB |
| Instances | 0–10 |
| GCP project | `dsgt-website` |

Build command (abbreviated):

1. `pnpm install`
2. `drizzle-kit push --verbose < /dev/null` on `@query/db` (additive only; destructive waits for a TTY confirmation that stdin cannot give)
3. `pnpm --filter @query/db db:check` — **fails the build** if a declared column is missing
4. `pnpm turbo run build --filter=web`
5. Copy `.next/static` (and `public` if present) into the standalone tree

Run: `node sites/mainweb/.next/standalone/sites/mainweb/server.js`

Secrets are GCP Secret Manager. Grant the App Hosting backend access once per secret, e.g. `firebase apphosting:secrets:grantaccess DATABASE_URL --backend query`.

Env mapping (names only) is in `apphosting.yaml`: `DATABASE_URL`, `AUTH_SECRET` (also copied to `NEXTAUTH_SECRET`), Google/GitHub OAuth, Stripe, Slack (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_SOCKET_MODE=false`), SMTP, DDoS ceilings, `TRUSTED_PROXY_HOPS=1`.

Slack Event Subscriptions, slash commands, and interactivity must use the App Hosting origin (`AUTH_URL` / `NEXTAUTH_URL` in `apphosting.yaml`, host `datasciencegt.org`), not Firebase Hosting `dsgt-website` / `sites/mainweb/out`:

```text
{AUTH_URL}/api/webhooks/slack
```

Create `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in Secret Manager before that deploy. See [`apps/dsgt-slack/README.md`](../../apps/dsgt-slack/README.md).

## Hacklytics — Firebase Hosting

Config: [`firebase.json`](../../firebase.json), [`.firebaserc`](../../.firebaserc).

| Hosting site / target | Public directory |
| --- | --- |
| `dsgt-website` | `sites/mainweb/out` (legacy static path; **production mainweb is App Hosting**, not this) |
| target `hacklytics` | `sites/hacklytics2027/out` |

Live deploys of Hacklytics: push to `main` runs `pnpm turbo run build --filter=hacklytics2027` then `FirebaseExtended/action-hosting-deploy` with `channelId: live` and `target: hacklytics`. Pull requests get preview channels `pr-<number>`.

Service account secret: `FIREBASE_SERVICE_ACCOUNT_DSGT_WEBSITE`.

## Local GCP access

See [GCP_SETUP.md](../../GCP_SETUP.md):

```bash
gcloud auth login
gcloud auth application-default login
firebase login
gcloud config set project dsgt-website
firebase use dsgt-website
```

`./scripts/sync-secrets.sh` is referenced there for pulling Secret Manager values into `.env.local`. If that script is not in the tree, copy secrets from Secret Manager manually or recreate the script.

## Docker

`.dockerignore` excludes git, `node_modules`, env files, markdown (except README), and Firebase metadata from an image build context. There is no root `Dockerfile` in the current tree; App Hosting builds from `apphosting.yaml`.

## First production admin

Sign in once, then insert an `admin` row with `role = 'super_admin'` and `is_active = true` for that `user_id`. Further staff are appointed from `/admin/staff`.
