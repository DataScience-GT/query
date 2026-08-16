# `@query/ui`

Shared React components and CSS for the main website. Package: `packages/ui`.

This is a small library, not a full design system. Mainweb also uses `@mawtech/glass-ui`, local `components/`, and Tailwind 4.

## Exports

`package.json` points `main` / `types` at `dist/` after `tsc`. Source:

| File | Export |
| --- | --- |
| `src/glass.tsx` | Glass-style primitives (re-exported from `src/index.ts`) |
| `src/card.tsx` / `card.jsx` | Card |
| `src/gradient.tsx` / `gradient.jsx` | Gradient |
| `src/turborepo-logo.tsx` | Logo leftover from the Turbo starter |
| `src/styles.css` | Shared styles; also exported as `@query/ui/styles` |

Peer dependency: React 18 or 19.

## Scripts

```bash
pnpm --filter @query/ui build:components   # tsc → dist/
pnpm --filter @query/ui build:styles       # tailwindcss CLI in → dist/index.css
pnpm --filter @query/ui dev:components
pnpm --filter @query/ui dev:styles
pnpm --filter @query/ui lint
```

Mainweb `transpilePackages` includes `@query/ui`, so the site can import source during Next builds even when `dist/` is stale. Prefer building the package when changing public exports.

## Tooling

ESLint: `@query/eslint-config`. Tailwind: `@query/tailwind-config`. TSConfig: `@query/tsconfig`.
