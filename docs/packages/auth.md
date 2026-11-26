# `@query/auth`

NextAuth v5 configuration for the portal. Package: `packages/auth`.

Mainweb mounts the handlers at `app/(portal)/api/auth/[...nextauth]/route.ts` (`basePath: "/api/auth"`). Custom pages: sign-in `/login`, error `/auth/error`. Email codes are completed via `/api/auth/verify-email` and the `/verify` UI.

## Exports

| Export | From |
| --- | --- |
| `auth`, `signIn`, `signOut`, `handlers` | `src/auth.ts` |
| `authConfig` | `src/config.ts` |
| `discordLoginEnabled` | `src/discord.ts`. The one answer to "is Discord registered", read by the provider list and by `/login` |
| `adapter` | `src/adapter.ts` |
| `getSession`, `requireAuth`, `getCurrentUserId` | `src/utils.ts` |
| `sendAcceptanceEmail` and the other templates, plus the pooled `Mailer` (not used for sign-in codes) | `src/email.ts` |

## Session strategy

If `DATABASE_URL` is set and the Drizzle adapter constructs, sessions are **database** sessions (`maxAge` 30 days, `updateAge` 24 hours). Without a database, NextAuth falls back to JWT so the app can still boot.

`trustHost: true` so App Hosting / Cloud Run can sit behind a proxy. `AUTH_URL` and `NEXTAUTH_URL` must still equal the public origin.

The `session` callback only copies `user.id`. Judge/admin flags are **not** loaded here — that used to be a DB checkout on every request for every attendee. Consumers use `user.getPortalContext` or `judge.isJudge`.

## Providers

### Google

Always registered. `allowDangerousEmailAccountLinking: true` so a Google identity can attach to an existing email account. CSRF is **PKCE + state**. Emptying `checks` is unsafe (forged callback + email linking).

### Discord

Registered only when **both** `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` exist (`src/discord.ts`). They are the same application as the [Linked Roles flow](../features/discord.md), which also needs `DISCORD_INVITE_URL`; sign-in does not. Same email-linking flag and **PKCE + state** as Google. `/login` reads `discordLoginEnabled()` on the server and shows the button only then.

- **Verified email only.** Discord's profile carries `verified`. The `signIn` callback refuses the sign-in unless it is `true` and an email is present, before any account is created or linked. Without that, email linking would let someone attach an address they never confirmed to the member who owns it.
- **No roles from login.** The scope is `identify email` (`DISCORD_LOGIN_SCOPE`), never `role_connections.write`, so a sign-in token cannot publish Linked Roles metadata. Nothing on the sign-in path calls Discord or writes `hackathon_participants.discord_*`. Roles come only from the post-acceptance link flow. Tests in `discord.test.ts` and `config.test.ts` pin all three.

**People who used GitHub.** GitHub sign-in was removed. `/login` tells them to sign in with Google, Discord or an email code using the same email. All three look the user up by email, case-insensitively (the adapter's `getUserByEmail`, the code route's `lower(email)`, one row per address by `user_email_lower_unique_idx`), so they reach the same account. Live database sessions are left alone. `/api/auth/signin/github` and `/api/auth/callback/github` redirect to `/login` (`next.config.mjs`) instead of ending on `/auth/error`. To count who is affected, read-only:

```sql
SELECT count(*) FROM "user" u
WHERE EXISTS (SELECT 1 FROM account a WHERE a."userId" = u.id AND a.provider = 'github')
  AND NOT EXISTS (SELECT 1 FROM account a WHERE a."userId" = u.id AND a.provider <> 'github');
```

Redirect URI to register on the Discord application (next to the link flow's `/api/discord/callback`):

```
https://<public-origin>/api/auth/callback/discord
```

### Email code

Nodemailer SMTP. Not a magic link: a 6-digit code from `crypto.randomInt`, stored as `custom:<code>` in `verificationToken`, 10-minute expiry. Outstanding `custom:%` tokens for that identifier are deleted first so spamming sign-in cannot stack valid codes.

HTML template is inline in `config.ts` (DSGT branding). SMTP host/user/password come from env (see [Environment](../operations/environment.md)).

Sign-in codes do not go through the pooled `Mailer`. `sendVerificationRequest` builds its own transport on every request with `createTransport(provider.server)` (same `EMAIL_SERVER_*` and `EMAIL_FROM`, no pool).

- One code email per address per minute. A repeat inside the minute sends nothing and keeps the live code.
- A `pg_advisory_xact_lock(hashtext(identifier))` transaction serialises parallel requests for the same address.
- On a send failure the new token row is deleted, so a retry can send.

Production currently uses consumer Gmail (~500 recipients/day, shared with acceptance and announcement mail). Acceptance waves are capped at 500 for that reason (server bound; the admin UI limits a wave to 200, `MASS_EMAIL_BATCH`). Switching providers is env-only: host, user, password secret, and a verified `EMAIL_FROM`.

## Adapter

`@auth/drizzle-adapter` over `user` / `account` / `session` / `verificationToken`. `createVerificationToken` and `useVerificationToken` are raw SQL to avoid Drizzle `boolin` errors on the compound primary key in this deployment. `@auth/drizzle-adapter` 1.11.3 targets drizzle-orm 0.45 and imports `BaseSQLiteDatabase`, which 1.0 removed, so the bundle failed; `patches/@auth__drizzle-adapter@1.11.3.patch` drops its SQLite branch (this app only runs Postgres). Remove the patch when Auth.js ships a release for drizzle-orm 1.0.

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
