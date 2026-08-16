# `@query/auth`

NextAuth v5 configuration for the portal. Package: `packages/auth`.

Mainweb mounts the handlers at `app/(portal)/api/auth/[...nextauth]/route.ts` (`basePath: "/api/auth"`). Custom pages: sign-in `/login`, error `/auth/error`. Email codes are completed via `/api/auth/verify-email` and the `/verify` UI.

## Exports

| Export | From |
| --- | --- |
| `auth`, `signIn`, `signOut`, `handlers` | `src/auth.ts` |
| `authConfig` | `src/config.ts` |
| `adapter` | `src/adapter.ts` |
| `getSession`, `requireAuth`, `getCurrentUserId` | `src/utils.ts` |
| `sendAcceptanceEmail` (and the mailer) | `src/email.ts` |

## Session strategy

If `DATABASE_URL` is set and the Drizzle adapter constructs, sessions are **database** sessions (`maxAge` 30 days, `updateAge` 24 hours). Without a database, NextAuth falls back to JWT so the app can still boot.

`trustHost: true` so App Hosting / Cloud Run can sit behind a proxy. `AUTH_URL` and `NEXTAUTH_URL` must still equal the public origin.

The `session` callback only copies `user.id`. Judge/admin flags are **not** loaded here — that used to be a DB checkout on every request for every attendee. Consumers use `user.getPortalContext` or `judge.isJudge`.

## Providers

### Google

Always registered. `allowDangerousEmailAccountLinking: true` so a Google identity can attach to an existing email account. CSRF is **PKCE + state**. Emptying `checks` is unsafe (forged callback + email linking).

### GitHub

Registered only when **both** `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` exist. Scope `read:user user:email` because the adapter requires an email. Same email-linking flag as Google. The login UI hides the button when the provider is absent.

Callback URL to register on the GitHub OAuth app:

```
https://<public-origin>/api/auth/callback/github
```

### Email code

Nodemailer SMTP. Not a magic link: a 6-digit code from `crypto.randomInt`, stored as `custom:<code>` in `verificationToken`, 10-minute expiry. Outstanding `custom:%` tokens for that identifier are deleted first so spamming sign-in cannot stack valid codes.

HTML template is inline in `config.ts` (DSGT branding). SMTP host/user/password come from env (see [Environment](../operations/environment.md)).

Production currently uses consumer Gmail (~500 recipients/day, shared with acceptance and announcement mail). Acceptance waves are capped at 500 for that reason. Switching providers is env-only: host, user, password secret, and a verified `EMAIL_FROM`.

## Adapter

`@auth/drizzle-adapter` over `user` / `account` / `session` / `verificationToken`. `createVerificationToken` and `useVerificationToken` are raw SQL to avoid Drizzle `boolin` errors on the compound primary key in this deployment.

## Sign-in event

`events.signIn` calls `linkPaidPaymentByVerifiedEmail` from `@query/db/services/membership`. The address is provider-verified, which is enough proof to claim a paid Stripe row. Errors are swallowed so membership never blocks login.

## Mailer (`src/email.ts`)

Process-wide pooled SMTP (`Mailer` class). `pool: true` only helps if the transporter outlives a single message — building one per send was a handshake storm on mass acceptance.

Tunable:

- `EMAIL_MAX_CONNECTIONS` (default 5)
- `EMAIL_MAX_MESSAGES` (default 100)

`sendAcceptanceEmail` and other transactional templates share this path so from-address and HTML/text cannot drift.

## Peer dependency

`next >= 15`. Mainweb is on Next 16.
