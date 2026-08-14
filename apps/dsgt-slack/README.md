# dsgt Slack bot

Bolt for JavaScript app for **Data Science @ Georgia Tech (DS@GT)**. In Slack it
appears as **@dsgt**. This is a custom Slack app owned by the club, not the
Cursor Slack integration.

The bot answers `@dsgt` mentions, direct messages, and the `/dsgt` slash
command. It can confirm that it is online (`ping`) and tell people how to join:
the first event is **August 26 (8/26)**, further details will be announced
there, and the club site is datasciencegt.org.

## Create the Slack app from the manifest

1. Open [https://api.slack.com/apps](https://api.slack.com/apps) and sign in to
   the workspace that should host the bot (typically the DS@GT Slack).
2. Click **Create New App** → **From an app manifest**.
3. Select the workspace, then paste the contents of
   [`manifest.yaml`](./manifest.yaml) (YAML is accepted).
4. Confirm the summary. The app name and bot user display name should both be
   `dsgt`. Socket Mode should be enabled.
5. Click **Create**.

You now have a real Slack app whose bot user is **dsgt**.

## Install into a workspace and collect tokens

1. In the app settings sidebar, open **OAuth & Permissions** and click
   **Install to Workspace**. Approve the requested bot scopes.
2. Copy the **Bot User OAuth Token** (`xoxb-...`) into `.env` as
   `SLACK_BOT_TOKEN`.
3. Open **Basic Information** and copy the **Signing Secret** into `.env` as
   `SLACK_SIGNING_SECRET`.
4. On **Basic Information**, under **App-Level Tokens**, click
   **Generate Token and Scopes**. Name it something like `socket-mode`, add the
   `connections:write` scope, and generate it. Copy the `xapp-...` value into
   `.env` as `SLACK_APP_TOKEN`.

Socket Mode is already on in the manifest, so you do not need a public URL for
local development.

## Run locally (Socket Mode)

From the monorepo root:

```bash
cp apps/dsgt-slack/.env.example apps/dsgt-slack/.env
# edit apps/dsgt-slack/.env with the three tokens above

pnpm install
pnpm --filter @query/dsgt-slack dev
```

`pnpm dev` at the repo root also starts this app (turbo `dev`), alongside the
sites.

When the process logs that the bot is running, it is connected to Slack.

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

## Host later over HTTP (Events API)

The same process can listen for Slack’s HTTP Events API instead of Socket Mode.
Bolt serves Slack at **`/slack/events`**.

1. Deploy the app with a public HTTPS URL.
2. Set `SLACK_SOCKET_MODE=false` and `PORT` (default `3000`) in the environment.
   `SLACK_APP_TOKEN` is not required in this mode.
3. In the Slack app settings:
   - Turn **Socket Mode** off.
   - **Event Subscriptions** → Request URL:
     `https://<your-host>/slack/events`
   - **Slash Commands** → `/dsgt` → Request URL:
     `https://<your-host>/slack/events`
   - **Interactivity & Shortcuts** → Request URL:
     `https://<your-host>/slack/events`
4. Start with `pnpm --filter @query/dsgt-slack start`.
5. `GET https://<your-host>/health` should return `ok`.

Reinstall the app if Slack asks you to after changing URLs or scopes.

## Scripts

| Script      | Command                                     |
| ----------- | ------------------------------------------- |
| Dev (watch) | `pnpm --filter @query/dsgt-slack dev`       |
| Start       | `pnpm --filter @query/dsgt-slack start`     |
| Lint        | `pnpm --filter @query/dsgt-slack lint`      |
| Typecheck   | `pnpm --filter @query/dsgt-slack typecheck` |
| Test        | `pnpm --filter @query/dsgt-slack test`      |

Repo-wide `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` include
this package (`pnpm test` runs the join-FAQ unit test along with the existing
vitest targets).

## Environment

See [`.env.example`](./.env.example). Do not commit `.env` or real tokens.
`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `SLACK_APP_TOKEN` (Socket Mode)
are required to start the process.
