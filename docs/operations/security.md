# Security

This page is the map of controls already in the product. It is not a pentest report.

## Authentication and sessions

- Database sessions when Postgres is available; 30-day max age
- Google and GitHub use PKCE + state. Do not set `checks: []`
- Email codes: CSPRNG 6-digit, 10-minute TTL, previous codes for that identifier deleted
- `allowDangerousEmailAccountLinking` is on so Google/GitHub can attach to an existing verified email. That is why CSRF on the OAuth callback must stay on
- Redirect callback only allows same-origin URLs

## Authorization

Roles are rows, not JWT claims.

| Gate | Who |
| --- | --- |
| Signed-in | Any `user` |
| `isScanner` | Any active `admin` including `volunteer` |
| `isAdmin` | Active admin whose role is **not** `volunteer` |
| `isSuperAdmin` | `super_admin` |
| `isJudge` | Active `judge` for the resolved edition |
| `isProjectLeader` | Active `project_leader` or staff |

Volunteers can staff check-in desks. They cannot delete editions, grant memberships, or pass `isAdmin`.

Draft hackathons are staff-only. Public child queries (`getEvents`, projects, results) call `assertHackathonVisible` and return `NOT_FOUND` (not `FORBIDDEN`) so existence is not leaked.

## Input

`scrubMarkup` in `packages/api/src/trpc.ts`:

- Rejects dangerous tags, inline handlers, `javascript:` URIs
- Does **not** rewrite HTML (rewriting ate prose like `loss<threshold`)
- Drops `__proto__` / `constructor` / `prototype` keys
- Caps nesting (10), object keys (50), array length (2500)
- Mutations must be `application/json` or `multipart/form-data`

Uploads use a 2MB cap and skip recursive scrub so base64 images survive.

SQL is parameterized via Drizzle. Do not concatenate SQL.

## Rate limits and DDoS

In-process token buckets (`middleware/security.ts`):

- Public vs authenticated configs (`RATE_LIMITS`)
- Signed-in callers are keyed by **user id**, not NAT IP (a 2000-person venue shares one address)
- Anonymous callers use `ip:` + resolved client IP
- Violation backoff decays after 10 minutes of good behavior so one bad afternoon does not lock someone for the event
- Stores are capped and swept so they cannot grow without bound

`TRUSTED_PROXY_HOPS` must match the number of proxies that append `X-Forwarded-For`. Wrong hops = spoofable IP or everyone sharing the load balancer’s address.

## HTTP

Mainweb (`next.config.mjs` + `proxy.ts`):

- HSTS preload
- CSP report-only by default (`report-uri /api/csp-report`); set `CSP_ENFORCE=true` to block
- Stripe hosts allowed in `script-src` / `connect-src` / `frame-src`
- Authenticated route prefixes: `Cache-Control: private, no-store`
- Proxy **does not** generate pathname ETags (that froze pages for a year after deploy)

Hacklytics Hosting sets `X-Content-Type-Options: nosniff` and long-cache for hashed assets. `sw.js` is no-store.

## Payments

- Amounts come from `pricing.ts`, not the client
- Webhook and reconcile ignore charges above `MAX_MEMBERSHIP_CHARGE_CENTS`
- One `user_account_link` per user and per payment (unique indexes) so double-tab linking cannot double-renew
- Membership grant is server-side after a verified email or a verified Stripe customer email

## Audit

`audit_logs` stores `action`, optional `userId`, `resourceId`, JSON metadata, and `security_severity` (`info` / `warn` / `critical`). Staff read them via `audit.list`. Security middleware can append events (rate limit, oversized payload).

## Secrets

Never commit `.env`. App Hosting injects Secret Manager values. GitHub deploy uses `FIREBASE_SERVICE_ACCOUNT_DSGT_WEBSITE`. CodeQL + dependency review run on `main`/`dev`.

## What this does not do

- In-memory rate limits and caches are **per Cloud Run instance**, not global
- CSP is report-only until explicitly enforced
- Consumer Gmail is a quota and reputation constraint for mass mail, not an application bug
