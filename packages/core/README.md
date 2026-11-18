# `@query/core`

The values every Data Science at Georgia Tech workspace shares: where the site lives, who the organisation is, and the time units and zone the portal reasons in. Zero runtime dependencies. ESM only.

In the [query](https://github.com/DataScience-GT/query) monorepo this package is `@query/core`. It is published to GitHub Packages as `@datascience-gt/core`. See [publishing](https://github.com/DataScience-GT/query/blob/main/docs/packages/publishing.md) for how to install it from there.

```sh
pnpm add @datascience-gt/core
```

## Entries

### `@datascience-gt/core`

Pure data. It touches no Node API, so a browser bundle, an edge runtime or a static site build can import it.

| Module | Exports |
| --- | --- |
| site | `SITE_ORIGIN` |
| identity | `ORG_NAME`, `ORG_NAME_SHORT`, `ORG_NAME_SPOKEN`, `ORG_TAGLINE`, `CONTACT_EMAIL`, `NOREPLY_EMAIL`, `SOCIAL_LINKS`, `MLH_CODE_OF_CONDUCT_URL` |
| time | `VENUE_TZ`, `MINUTE`, `HOUR`, `DAY`, `SELF_CHECK_IN_LEAD_MS`, `STATUS_BUCKET_MINUTES`, `STATUS_BUCKET_MS` |

```ts
import { ORG_NAME, SITE_ORIGIN, DAY } from "@datascience-gt/core";
```

### `@datascience-gt/core/server`

Server only. `siteOrigin()` and `configuredSiteOrigin()` read `process.env.NEXTAUTH_URL` and `AUTH_URL`, so import this entry only from code that runs on a server. Do not import it from a browser bundle.

```ts
import { siteOrigin } from "@datascience-gt/core/server";
```

## Building

`pnpm --filter @query/core build` compiles `src/` to `dist/` as ESM with `.d.ts` files. Inside the monorepo, `exports` point at `src/` so apps, tests and type checks read the source directly. `publishConfig` swaps `exports`, `main` and `types` to `dist/` when the package is packed or published.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
