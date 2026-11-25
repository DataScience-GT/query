# Hacklytics 2026 (`hacklytics2026`)

Path: `sites/hacklytics2026`  
Workspace name: `hacklytics2026`  
Framework: Astro (static output), React 19 islands, Tailwind 4 (`@tailwindcss/vite`)

Archived event site for Hacklytics 2026 (the Willy Wonka theme). It was imported from the standalone `DataScience-GT/Hacklytics2026` repo with its git history (via `git subtree add`). It has **no database** and **no tRPC**, and it is not under active development.

## Run

```bash
pnpm --filter hacklytics2026 dev        # astro dev, http://localhost:3000
pnpm --filter hacklytics2026 build      # astro build, static files to out/
pnpm --filter hacklytics2026 preview    # serve out/
pnpm --filter hacklytics2026 lint       # oxlint
pnpm --filter hacklytics2026 typecheck  # tsc --noEmit
```

## Deploy

This repo no longer deploys the site. `.github/workflows/ci.yml` has no 2026 preview or deploy job, and `firebase.json` and `.firebaserc` have no `hacklytics2026` target. The live site keeps serving its last release, from Firebase Hosting site `hacklyticss2026` (double s) in project `dsgt-website`.

The source stays here, and `ci.yml`'s `verify` job still lints, typechecks and builds it with every other workspace (`turbo run lint typecheck`, `turbo run build`). It uploads no artifact for it. Releasing a change by hand would first need a Hosting target for it restored in `firebase.json` and `.firebaserc`.

The old repo's own workflow deploys to a different project and site (`hacklytics2025` / `hacklytics2026`), so it does not collide with this one. The old repo should still be archived so there is a single source of truth.

## Notes

- `out/` is build output and is gitignored.
- The site was ported from a Next.js static export to Astro. The rendered page matches the Next build (full-page screenshots differ only by 1-level rounding noise); fonts (Truculenta, Willy Wonka) are self-hosted from `public/fonts/`.
- Pages are `src/pages/` (`index.astro`, `404.astro`). The sections are React components rendered at build time with no JavaScript; four islands hydrate: `Navbar` (`client:load`), `Countdown` (`client:only`), and the schedule and FAQ sections (`client:visible`).
- `src/components/Img.tsx` renders the same `<img>` markup `next/image` produced with `unoptimized` on.
