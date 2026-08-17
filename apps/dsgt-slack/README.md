# dsgt Slack bot

Bolt for JavaScript app for **Data Science @ Georgia Tech (DS@GT)**. In Slack it
appears as **@dsgt**. This is a custom Slack app owned by the club, not a
third-party Slack integration.

The bot answers `@dsgt` mentions, direct messages, and the `/dsgt` slash
command. It can confirm that it is online (`ping`) and tell people how to join:
the first event is **August 26 (8/26)**, further details will be announced
there, and the club site is datasciencegt.org.

Production traffic is **HTTP Events API** on the existing Firebase App Hosting
backend (`sites/mainweb` / Cloud Run). There is no second Cloud Run service and
no Socket Mode process in production.

## Create the Slack app from the manifest

1. Open [https://api.slack.com/apps](https://api.slack.com/apps) and sign in to
   the workspace that should host the bot (typically the DS@GT Slack).
2. Click **Create New App** → **From an app manifest**.
3. Select the workspace, then paste the contents of
   [`manifest.yaml`](./manifest.yaml) (YAML is accepted).
4. Confirm the summary. The app name and bot user display name should both be
   `dsgt`. Socket Mode should be **off**. Request URLs are left unset in the
   manifest so you can create the app before the webhook is deployed.
5. Click **Create**.

You now have a real Slack app whose bot user is **dsgt**.

## Install into a workspace and collect tokens

1. In the app settings sidebar, open **OAuth & Permissions** and click
   **Install to Workspace**. Approve the requested bot scopes.
2. Copy the **Bot User OAuth Token** (`xoxb-...`). You will put this in GCP
   Secret Manager as `SLACK_BOT_TOKEN` (and in `apps/dsgt-slack/.env` only if
   you run the bot locally).
3. Open **Basic Information** and copy the **Signing Secret**. That is
   `SLACK_SIGNING_SECRET`.

Do **not** commit `.env`, tokens, or signing secrets. `SLACK_APP_TOKEN` is not
required in production.

## Production Request URL (Firebase App Hosting)

Slack must POST to the **Firebase App Hosting / Cloud Run** URL for `sites/mainweb`
(workspace `web`). That origin is `{AUTH_URL}` — the same public
origin as `AUTH_URL` / `NEXTAUTH_URL` in [`apphosting.yaml`](../../apphosting.yaml).

**Use this Request URL everywhere** (Event Subscriptions, Slash Commands
`/dsgt`, Interactivity & Shortcuts). Take the `AUTH_URL` / `NEXTAUTH_URL`
value from [`apphosting.yaml`](../../apphosting.yaml) (the App Hosting origin
for the club site, host `datasciencegt.org`) and append the path:

```text
{AUTH_URL}/api/webhooks/slack
```

Set those three URLs in the Slack app settings **after** the App Hosting
deploy that includes this route is live. Slack will POST a
`url_verification` challenge; the Next.js route answers it.

The Next.js route is
`sites/mainweb/app/(portal)/api/webhooks/stripe`’s neighbor:
`sites/mainweb/app/(portal)/api/webhooks/slack/route.ts`. `proxy.ts` already
leaves `/api/webhooks/*` alone, same as Stripe.

### App Hosting vs Firebase Hosting

| Surface | What it is | Slack |
| --- | --- | --- |
| **Firebase App Hosting** | Next.js on Cloud Run, `apphosting.yaml`, `sites/mainweb` | **Yes — this is the API** |
| **Firebase Hosting** site `dsgt-website` | Static `sites/mainweb/out/` | **No.** That site cannot run the webhook |

If Event Subscriptions shows a verification failure, the Request URL is almost
certainly pointing at Hosting `out/` (or the wrong host), not App Hosting.

After the App Hosting deploy that includes this route is live, open **Event
Subscriptions** and click **Retry** / save so Slack can complete the
`url_verification` challenge.

Reinstall the app if Slack asks you to after changing URLs or scopes.

## Secret Manager (one-time)

GCP project: `dsgt-website` (number `672446353769`). App Hosting backend name:
`query`. [`apphosting.yaml`](../../apphosting.yaml) maps:

| Process env | Secret |
| --- | --- |
| `SLACK_BOT_TOKEN` | `projects/672446353769/secrets/SLACK_BOT_TOKEN` |
| `SLACK_SIGNING_SECRET` | `projects/672446353769/secrets/SLACK_SIGNING_SECRET` |
| `SLACK_SOCKET_MODE` | literal `false` (not a secret) |

`SLACK_APP_TOKEN` is **not** wired. Create the secrets before the deploy that
references them, or App Hosting will fail to start:

```bash
gcloud config set project dsgt-website

# Create empty secrets, then add a version from stdin (do not put tokens in the
# shell history file if you can avoid it — prefer a local file you delete).
gcloud secrets create SLACK_BOT_TOKEN --project=dsgt-website
gcloud secrets create SLACK_SIGNING_SECRET --project=dsgt-website

printf '%s' 'xoxb-your-bot-token' | gcloud secrets versions add SLACK_BOT_TOKEN --data-file=-
printf '%s' 'your-signing-secret' | gcloud secrets versions add SLACK_SIGNING_SECRET --data-file=-

firebase apphosting:secrets:grantaccess SLACK_BOT_TOKEN --backend query
firebase apphosting:secrets:grantaccess SLACK_SIGNING_SECRET --backend query
```

Replace the `printf` placeholders with the real values from the Slack app
settings. Never commit those values.

## Run locally (Socket Mode)

Socket Mode is a **local-only** option so you can develop without a public URL.
Production stays on HTTP.

1. In the Slack app settings, turn **Socket Mode** on temporarily (or use a
   separate development app). Generate an App-Level Token with
   `connections:write` (`xapp-...`).
2. From the monorepo root:

```bash
cp apps/dsgt-slack/.env.example apps/dsgt-slack/.env
# edit apps/dsgt-slack/.env with SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET,
# SLACK_APP_TOKEN, and SLACK_SOCKET_MODE=true

pnpm install
pnpm --filter @query/dsgt-slack dev
```

`pnpm dev` at the repo root also starts this package. If `.env` is missing, the
task stays idle so the rest of the monorepo can still boot.

You can also hit the Next.js webhook locally while `web` is running
(`http://localhost:3001/api/webhooks/slack`) if you tunnel that URL to Slack.
That path is what production uses.

### Invite @dsgt to a channel

In the channel:

```text
/invite @dsgt
```

Then mention it (`@dsgt ping`) or run `/dsgt help`. Direct messages work from
the app's **Messages** tab without an invite.

### Quick checks after install

| Action                                    | Expected reply                                  |
| ----------------------------------------- | ----------------------------------------------- |
| `@dsgt ping` or `/dsgt ping`              | Health check confirming the bot is online       |
| `/dsgt help`                              | List of topics                                  |
| “How do I join?” in a DM, or `/dsgt join` | August 26 first-event FAQ and datasciencegt.org |

## Scripts

| Script | Command |
| --- | --- |
| Dev (watch) | `pnpm --filter @query/dsgt-slack dev` |
| Start | `pnpm --filter @query/dsgt-slack start` |
| Lint | `pnpm --filter @query/dsgt-slack lint` |
| Typecheck | `pnpm --filter @query/dsgt-slack typecheck` |
| Test | `pnpm --filter @query/dsgt-slack test` |

Repo-wide `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` include
this package (`pnpm test` runs the join-FAQ unit test along with the existing
vitest targets).

## Environment

See [`.env.example`](./.env.example). Do not commit `.env` or real tokens.

| Variable | Local Socket Mode | Production (App Hosting) |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | required | Secret Manager |
| `SLACK_SIGNING_SECRET` | required | Secret Manager |
| `SLACK_APP_TOKEN` | required | not used |
| `SLACK_SOCKET_MODE` | `true` (default) | `false` |
