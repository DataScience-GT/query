# Environment variables

Names the process actually reads. Do not commit values. App Hosting maps many of these from GCP Secret Manager in `apphosting.yaml`.

Turbo `globalEnv` lists the ones that must invalidate the build cache when they change.

## Required for a working portal

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `@query/db` | Neon pooled URL in prod; local `postgresql://postgres:postgres@localhost:5433/neondb` |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | NextAuth | App Hosting sets both from secret `AUTH_SECRET` |
| `AUTH_URL` / `NEXTAUTH_URL` | NextAuth | Public origin. Must match the host users open |

Without `DATABASE_URL`, `db` is null, sessions fall back to JWT, and tRPC procedures that require DB fail with `PRECONDITION_FAILED`.

## OAuth

| Variable | Provider |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google (App Hosting secret `AUTH_GOOGLE_ID`) |
| `GOOGLE_CLIENT_SECRET` | Google (`AUTH_GOOGLE_SECRET`) |
| `GITHUB_CLIENT_ID` | GitHub (`AUTH_GITHUB_ID`) — optional; both GitHub vars required to register the provider |
| `GITHUB_CLIENT_SECRET` | GitHub (`AUTH_GITHUB_SECRET`) |

## Email

| Variable | Default / notes |
| --- | --- |
| `EMAIL_SERVER_HOST` | SMTP host |
| `EMAIL_SERVER_PORT` | `587` |
| `EMAIL_SERVER_USER` | SMTP username |
| `EMAIL_SERVER_PASSWORD` | Secret |
| `EMAIL_FROM` | From address; must be verified with the provider |
| `EMAIL_MAX_CONNECTIONS` | `5` |
| `EMAIL_MAX_MESSAGES` | `100` |

## Stripe

| Variable | Notes |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser Payment Element |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature |
| `STRIPE_MOCK_MODE` | Test helper; listed in Turbo `globalEnv` |

## Database pool

| Variable | Default |
| --- | --- |
| `DB_POOL_MAX` | `20` |
| `DB_CONNECTION_TIMEOUT_MS` | `3000` |

## Security / proxy

| Variable | Default / notes |
| --- | --- |
| `TRUSTED_PROXY_HOPS` | App Hosting sets `1` (Cloud Run behind Google LB). Increment if a CDN is added. Process logs `[Security] x-forwarded-for has N entries` at startup; hops should be `entries - 1` |
| `DDOS_MAX_REQUESTS_PER_MINUTE` | App Hosting `20000` |
| `DDOS_SUSPICIOUS_THRESHOLD` | `14000` |
| `DDOS_BLOCK_DURATION_MS` | `30000` |
| `DDOS_BURST_THRESHOLD` | `3000` |
| `DDOS_BURST_WINDOW_MS` | Code default if unset |
| `DDOS_CLEANUP_INTERVAL_MS` | Code default if unset |
| `CSP_ENFORCE` | `true` turns CSP from Report-Only into enforcing. Default is report-only |

## Runtime (App Hosting)

| Variable | Value |
| --- | --- |
| `PORT` | `8080` |
| `HOSTNAME` | `0.0.0.0` |
| `NODE_ENV` | `production` |

`GCP_SETUP.md` mentions `RESEND_API_KEY`; the mailer in this repo uses SMTP (`EMAIL_SERVER_*`), not Resend.

## Local files

`drizzle.config.ts` loads **root** `.env` via dotenv. Next.js also loads `sites/mainweb/.env.local`. Keep `DATABASE_URL` consistent in both if you use both files.
