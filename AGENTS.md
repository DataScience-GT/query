# AGENTS.md

## Cursor Cloud specific instructions

This is a **pnpm + Turborepo monorepo** (`pnpm@10.33.2`, Node 20–23; the VM has Node 22 + pnpm via `corepack`). It contains three deployable products plus shared packages:

- `sites/mainweb` (workspace name `web`) — the main Next.js full‑stack app: public marketing site **and** an authenticated member Portal (auth, tRPC, Drizzle/Postgres, Stripe). Dev server on **port 3001**.
- `sites/hacklytics2027` — static Next.js hackathon marketing site. Dev server on **port 3000**.
- `sites/discordBot` (`@query/discord-bot`) — standalone Discord.js bot (no HTTP port).

Standard scripts live in the root `package.json` (`dev`, `build`, `lint`, `typecheck`, `test`) and per‑package `package.json` files. `pnpm dev` runs every app in parallel via Turbo; use `pnpm --filter web dev` / `pnpm --filter hacklytics2027 dev` to run one. Tests: `pnpm test` (Vitest, `packages/api`). Lint: `pnpm lint`.

### Dependencies are auto-installed
The startup/update script runs `pnpm install`. You normally do **not** need to reinstall.

### Postgres runs in Docker, started manually (no systemd on the VM)
The DB is **required** for the mainweb portal and any DB/auth flows. Docker is pre-installed but the daemon is **not** started automatically:

1. Start the Docker daemon (background): `sudo dockerd > /tmp/dockerd.log 2>&1 &` then wait a few seconds. The daemon is configured for `fuse-overlayfs` with the containerd snapshotter disabled (see `/etc/docker/daemon.json`) — required in this VM; don't change it.
2. Start Postgres: `sudo docker compose up -d db` (root `docker-compose.yml`; Postgres 15 on host port **5433**, db `app_db`, user/pass `postgres`/`postgres`).
3. Apply the schema: `cd packages/db && pnpm drizzle-kit push --force`. See gotcha below — `pnpm --filter @query/db migrate:push` is interactive and **silently no-ops in a non-interactive shell**, so always pass `--force`. It is idempotent.

### CRITICAL: injected Secrets point at PRODUCTION — override to local before running dev servers
The user's Cursor Secrets are injected into the VM environment and set `DATABASE_URL`, `EMAIL_SERVER_*` (real Gmail SMTP), `STRIPE_*` (LIVE keys), `NEXTAUTH_URL`, etc. to **production/live** values. **Next.js does NOT override already-defined `process.env` values with `.env`/`.env.local`**, so a dev server started with the ambient environment will talk to the **production database, send real emails, and use live Stripe keys**.

To develop safely against local services, launch the mainweb dev server with explicit local overrides so they take precedence over the injected env, e.g.:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5433/app_db' \
AUTH_URL='http://localhost:3001' NEXTAUTH_URL='http://localhost:3001' \
EMAIL_SERVER_HOST='127.0.0.1' EMAIL_SERVER_PORT='1025' EMAIL_SERVER_USER='' EMAIL_SERVER_PASSWORD='' \
EMAIL_FROM='noreply@datasciencegt.org' \
STRIPE_SECRET_KEY='' NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='' STRIPE_WEBHOOK_SECRET='' \
pnpm --filter web dev
```

`AUTH_SECRET`/`NEXTAUTH_SECRET` from the injected env are fine to reuse. `sites/mainweb/.env.local` and root `.env` also hold local values, but remember they are ignored for any variable already present in `process.env`, which is why the inline overrides above are needed. `packages/db` tooling (drizzle-kit) reads the root `.env` directly, so keep `DATABASE_URL` local there too.

### Email (6-digit code) login without real email
The portal login is a 6-digit code flow. The code is written to the Postgres `verificationToken` table as `custom:<code>` before the email is sent. For local dev you can either (a) run a local SMTP catcher on `127.0.0.1:1025` (`python3 -m aiosmtpd -n -l 127.0.0.1:1025`, pre-installed) and point `EMAIL_SERVER_HOST/PORT` at it, or (b) simply read the latest code from the DB:
`sudo docker exec monorepo-postgres psql -U postgres -d app_db -tAc "SELECT replace(token,'custom:','') FROM \"verificationToken\" WHERE token LIKE 'custom:%' ORDER BY expires DESC LIMIT 1;"`

### Discord bot needs live credentials
`sites/discordBot` validates its env with zod and hard-fails unless real `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `GUILD_ID`, role IDs, and `NOTION_TOKEN`/`NOTION_GUIDE_PAGE_ID` are set. It cannot run locally without those and is optional for portal/site work.

### Stale docs
`GCP_SETUP.md` references `pnpm dev:full` and `scripts/sync-secrets.sh`, **neither of which exists**. Use `pnpm dev` / per-filter commands instead.
