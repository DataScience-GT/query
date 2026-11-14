# Hacklytics 2026 (`hacklytics2026`)

Path: `sites/hacklytics2026`  
Workspace name: `hacklytics2026`  
Framework: Next.js (static export), React 19, Tailwind 4 (`@tailwindcss/postcss`)

Archived event site for Hacklytics 2026 (the Willy Wonka theme). It was imported from the standalone `DataScience-GT/Hacklytics2026` repo with its git history (via `git subtree add`). It has **no database** and **no tRPC**, and it is not under active development.

## Run

```bash
pnpm --filter hacklytics2026 dev        # next dev --turbopack
pnpm --filter hacklytics2026 build      # next build; output: "export" writes static files to out/
pnpm --filter hacklytics2026 lint       # oxlint
pnpm --filter hacklytics2026 typecheck  # tsc --noEmit
```

## Deploy

Firebase Hosting target `hacklytics2026` (site `hacklyticss2026`, double s, URL hacklyticss2026.web.app) in project `dsgt-website`, public dir `sites/hacklytics2026/out` (root `firebase.json`; target mapping in root `.firebaserc`).

Workflow: `.github/workflows/ci.yml`. The `verify` job builds every site and uploads `out/` as artifact `hacklytics2026-out`; `deploy-hacklytics2026` ships it live on `main` and `preview-hacklytics2026` to channel `pr-N` on PRs, with the same service account secret as 2027. Neither runs unless `verify` passes.

Manual fallback, from the repo root after building:

```bash
pnpm turbo run build --filter=hacklytics2026
firebase deploy --only hosting:hacklytics2026
```

Caching: `/_next/static/**` is `max-age=31536000, immutable`; fonts and images `max-age=86400, stale-while-revalidate=604800`; HTML `max-age=0, must-revalidate`; everything gets `nosniff`. `cleanUrls` and `trailingSlash` are off: the export has one page plus `404.html`.

The old repo's own workflow deploys to a different project and site (`hacklytics2025` / `hacklytics2026`), so it does not collide with this one. The old repo should still be archived so there is a single source of truth.

## Notes

- `out/` is build output and is gitignored.
- `images.unoptimized` is on in `next.config.ts`; static export cannot use the image optimizer.
