# `@query/ui`

The design system for the main website. Package: `packages/ui`. Source-only: `exports` point at `src/`, there is no build, and mainweb compiles it through `transpilePackages`.

Hacklytics has its own theme and does not use it. Mainweb also uses local `components/` and Tailwind 4.

## Layout

| Path | Import | What |
| --- | --- | --- |
| `src/classes.ts` | `@query/ui/classes` | Tailwind class strings for the portal look: headings, buttons, fields, tabs, chips, status |
| `src/theme.css` | `@query/ui/theme.css` | `@theme inline` colour mapping, `--ui-*` neutral ramp (dark and `.light`), `--color-dsgt-teal`, and `@source` so Tailwind scans the package |
| `src/portal.css` | `@query/ui/portal.css` | Portal tokens (`:root`/`.dark`/`.light` variables), token utilities such as `.text-accent`, `.liquid-glass` surfaces |
| `src/<Name>.tsx` | `@query/ui/<Name>` | One primitive per file, no barrel |

Primitives: `Alert`, `Checkbox`, `FormChipSelect`, `FormInput`, `FormTextarea`, `LiquidGlass`, `Modal`, `SearchableSelect`, `Skeleton`, `Spinner`, `StatTile`, `StepProgress`, `Switch`.

Mainweb imports `theme.css` from `app/globals.css` and `portal.css` from `app/(portal)/layout.tsx`. What stays in mainweb is the site-specific CSS (`app/(portal)/liquid-glass.css`: reset, scrollbars, light overrides, the `/hacklytics` theme) and domain wrappers that map `@query/db` types to labels.

## Adding a primitive

Add `src/<Name>.tsx`, take icons and copy as props (the package has no icon dependency), add `"use client"` only for hooks, and use the strings from `classes.ts` so rendered CSS stays the same. A test goes beside it as `<Name>.test.tsx`; the root `pnpm test` runs `packages/ui`.

## Scripts

```bash
pnpm --filter @query/ui typecheck
pnpm --filter @query/ui lint
```
