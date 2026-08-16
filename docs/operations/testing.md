# Testing

Root script:

```bash
pnpm test
```

That is:

```bash
vitest run packages/api packages/db sites/mainweb/lib
```

CI: `.github/workflows/test.yml` on pushes to `main`/`dev` and on pull requests.

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
| Security / sanitizer / rate limit | `security.test.ts`, `resilience.test.ts` |
| Judges / participants / initiatives / bootcamp / announcements | matching `*-edge.test.ts` / `bootcamp.test.ts` / `announcements.test.ts` |
| Portal context | `services/portal-context.test.ts`, `routers/user/portal-context.test.ts` |
| Judge helpers | `routers/judge/helpers.test.ts` |

Tests use `src/test/create-mock-context.ts` and `.internal-tests/_db-tx-mock.ts` rather than a live database.

`scrubMarkup` is exported specifically so tests hit the sanitizer the request path runs (a previous unused stripper made the suite lie).

## `@query/db`

`src/services/membership.test.ts` — grant, lapse, current-edition resolution, payment linking.

## Mainweb

`sites/mainweb/lib/*.test.ts` — phone formatting, hackathon slugs, `safe-callback`.

## Hacklytics

```bash
pnpm --filter hacklytics2027 e2e
```

Playwright (`@playwright/test`). `scripts/capture-vision.ts` is a visual capture helper, not the default CI job.

## What “green” means

`pnpm test` does **not** run `pnpm lint`, `pnpm typecheck`, or `pnpm build`. CI build is a separate workflow (`pnpm-ci.yml`). Run all four before a release-quality PR:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
