# Publishing shared packages

Two workspace packages are built to be used outside this repo:

| In the repo | Published as | What ships |
| --- | --- | --- |
| `@query/core` | `@datascience-gt/core` | `dist/` (ESM JavaScript and `.d.ts`), built by `tsc -p tsconfig.build.json` |
| `@query/event-kit` | `@datascience-gt/event-kit` | `src/` (Astro, TSX, CSS), as Astro component libraries usually ship |

Both are licensed Apache-2.0, like the rest of the repo, and carry their own `LICENSE` and `README.md`.

Inside the monorepo nothing changes. Workspaces import `@query/core` and `@query/event-kit` by their repo names, and `exports` point at `src/`. When a package is packed, pnpm swaps in `publishConfig`, so the tarball's `exports` point at `dist/` for core.

## Registry

They publish to GitHub Packages under the GitHub organization's scope, `@datascience-gt`. GitHub Packages only accepts a scope that matches the owning organization, which is why the published names differ from the repo names. The release job rewrites `name` in its own checkout just before publishing. The repo itself keeps the `@query` names.

## Releasing

1. Bump `version` in `packages/<name>/package.json` in a normal PR and merge it.
2. Publish, either way:
   - **Actions tab:** run **Publish packages** and pick `core` or `event-kit`. Tick **dry-run** to see what would ship without publishing.
   - **Tag:** push `core-v<version>` or `event-kit-v<version>`. The job fails if the tag's version differs from `package.json`.

The job builds the package, refuses to publish if it depends on another `@query/*` package or a `workspace:` range (that dependency would not exist on the registry), drops `devDependencies`, renames it, and runs `pnpm publish` with the repo's `GITHUB_TOKEN`. See `.github/workflows/publish-packages.yml`.

To check a package locally:

```
pnpm --filter @query/core build
pnpm --filter @query/core pack
pnpm --filter @query/core publish --dry-run --no-git-checks
```

## Installing in another project

Add to that project's `.npmrc`:

```
@datascience-gt:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

GitHub Packages asks for a token even for public packages. Use a personal access token with `read:packages`, or the workflow's `GITHUB_TOKEN` in CI. Then:

```
pnpm add @datascience-gt/core
```

```ts
import { SITE_ORIGIN, SOCIAL_LINKS, DAY } from "@datascience-gt/core";
import { siteOrigin } from "@datascience-gt/core/server"; // server only: reads NEXTAUTH_URL / AUTH_URL
```

`@datascience-gt/event-kit` needs `astro`, `react`, `react-dom` and `tailwindcss` from the consuming site (peer dependencies). See [docs/sites/event-kit.md](../sites/event-kit.md) for the config it expects.
