# Hacklytics 2027 (`hacklytics2027`)

Path: `sites/hacklytics2027`  
Workspace name: `hacklytics2027`  
Framework: Next.js 16, React 19, Tailwind 4, **static export** (`output: "export"`)

Marketing site for Hacklytics 2027 (“Digital Bloom”). It has **no database** and **no tRPC**. Anything dynamic (interest list, registration) lives on the portal.

## Run

```bash
pnpm --filter hacklytics2027 dev     # next dev --turbopack (port 3000)
pnpm --filter hacklytics2027 build   # writes static files for Firebase Hosting
pnpm --filter hacklytics2027 e2e     # Playwright
```

## Structure

| Path | Role |
| --- | --- |
| `app/page.tsx` | Home (pixel garden hero + sections) |
| `app/layout.tsx` | Fonts (Roboto Mono, Space Grotesk, Silkscreen), metadata, SW registrar |
| `app/not-found.tsx` | 404 |
| `components/HomeSections.tsx` | Lazy-loaded below-the-fold sections |
| `components/sections/*` | About, tracks, schedule, prizes/speakers, FAQ, sponsors |
| `components/pixel/*` | Pixel sprites / garden |
| `components/Navbar.tsx`, `Footer.tsx` | Chrome |
| `lib/links.ts` | Portal origin + interest URL |
| `public/sw.js` | Service worker (Firebase header: no-cache, `Service-Worker-Allowed: /`) |

Schedule copy lives in `components/sections/Schedule/data.ts`.

## Interest CTA

`lib/links.ts` is the only outbound destination. The Typeform this replaced was pasted in four files and drifted.

Interest requires a portal account (verified email). The CTA is:

```
{PORTAL_ORIGIN}/login?callbackUrl=/hacklytics
```

`callbackUrl` is encoded so it survives the email-code hop through `/verify`. The portal only honors same-origin paths.

## Deploy

Firebase Hosting target `hacklytics`, public dir `sites/hacklytics2027/out` (`firebase.json`).

Workflows:

- `.github/workflows/deploy-hacklytics.yml` — build filter `hacklytics2027`, deploy target `hacklytics` (live on `main`, preview channel `pr-N` on PRs)
- `.github/workflows/firebase-hosting-merge.yml` — same live deploy on `main`
- `.github/workflows/firebase-hosting-pull-request.yml` — PR preview channels

Asset caching: hashed JS/CSS/fonts/images `max-age=31536000, immutable`; HTML `max-age=3600`. See `firebase.json`.

Images are `unoptimized: true` because static export has no image optimizer. React Compiler is on.

## Assets

MLH league trust badges live in the repo-root folder `trust badge/` (SVG + `.ai`). Copy into `public/` if a page needs to ship one.
