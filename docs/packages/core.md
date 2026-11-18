# `@query/core`

The values every workspace shares: where the site lives, who the organisation is, and the time units and zone the portal reasons in. Package: `packages/core`.

It has no runtime dependencies and imports no other workspace, so any layer can depend on it, including the static event sites. `turbo.json` tags it `core` and denies it every other layer, which `pnpm turbo boundaries` enforces.

## Modules

| File | Exports |
| --- | --- |
| `src/site.ts` | `SITE_ORIGIN`, the production origin |
| `src/identity.ts` | `ORG_NAME`, `ORG_NAME_SPOKEN`, `ORG_TAGLINE`, `CONTACT_EMAIL`, `NOREPLY_EMAIL`, `SOCIAL_LINKS` |
| `src/time.ts` | `VENUE_TZ`, `MINUTE`, `HOUR`, `DAY`, `SELF_CHECK_IN_LEAD_MS`, `STATUS_BUCKET_MINUTES`, `STATUS_BUCKET_MS` |
| `src/server.ts` | `siteOrigin()` and `configuredSiteOrigin()`, imported as `@query/core/server` |

The default entry, `@query/core`, is pure data. It touches no Node API, so a browser bundle or an Astro build can import it. `@query/core/server` reads `process.env.NEXTAUTH_URL` and `AUTH_URL`, and only server code imports it.

## What stays in `@query/db`

Values that describe a database column stay in `@query/db/constants`: the role, status, shirt size, level of study, judging state and check-in method lists that `pgEnum` and column `enum` options are built from. The API and the portal import them from there so a form can never offer a value the column rejects.

## Adding a value

Put a value here when two workspaces need it, instead of typing it again where it is used. A value that only one workspace reads stays in that workspace.
