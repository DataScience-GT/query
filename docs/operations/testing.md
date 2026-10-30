# Testing

Root script:

```bash
pnpm test
```

That is:

```bash
vitest run packages/api packages/db sites/mainweb/lib
```

`pnpm test` first runs `tooling/scripts/src/guard-local.ts`, which refuses a non-local `DATABASE_URL` or a Stripe live key. The suites mock the database, so CI sets neither and passes.

CI: the `verify` job in `.github/workflows/ci.yml` on pushes to `main`/`dev` and on pull requests.

## `@query/api`

```bash
pnpm --filter @query/api test
```

Config: `packages/api/vitest.config.ts`. Includes `src/**/*.test.ts` and `src/.internal-tests/**/*.test.ts`. Aliases `@query/db` and `@query/db/services/membership` to source so Vite does not smash the deep import.

| Area | Files (indicative) |
| --- | --- |
| Router smoke | `.internal-tests/routers.test.ts` |
| Hackathon flow | `hackathon-flow.test.ts`, `hackathon-admin-edge.test.ts`, `hackathon-interest.test.ts` |
| Payments | `stripe-payments.test.ts` |
| QR / check-in | `qr-checkin.test.ts` |
| Check-in rule-break flags | `services/check-in-flags.test.ts`, `.internal-tests/check-in-flags-*.test.ts` |
| Security / sanitizer / rate limit | `security.test.ts`, `resilience.test.ts` |
| Judges / participants / initiatives / bootcamp / announcements | matching `*-edge.test.ts` / `bootcamp.test.ts` / `announcements.test.ts` |
| Portal context | `services/portal-context.test.ts`, `routers/user/portal-context.test.ts` |
| Judging scoring, scope, room links | `services/judging/*.test.ts` |

Tests use `src/test/create-mock-context.ts` and `.internal-tests/_db-tx-mock.ts` rather than a live database.

`scrubMarkup` is exported specifically so tests hit the sanitizer the request path runs (a previous unused stripper made the suite lie).

## `@query/db`

`src/services/membership.test.ts` — grant, lapse, current-edition resolution, payment linking.

## Mainweb

`sites/mainweb/lib/*.test.ts` — phone formatting, hackathon slugs, `safe-callback`, bootcamp ZIP rules (`bootcamp-file.test.ts`), the download gate (`bootcamp-route-rules.test.ts`, where the null-term trap is held down) and the upload and download handlers (`bootcamp-routes.test.ts` — the handlers live under `app/`, which the root script does not glob).

## Hacklytics

No automated tests. CI lints and builds the site in the `verify` job. `scripts/capture-vision.mts` lets people and agents drive the site in a browser; see [the site reference](../sites/hacklytics2027.md#driving-the-site-from-an-agent). It is not a CI job.

## What “green” means

`pnpm test` does **not** run `pnpm lint`, `pnpm typecheck`, or `pnpm build`. CI runs all four in the `verify` job of `ci.yml`. Run all four before a release-quality PR:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
