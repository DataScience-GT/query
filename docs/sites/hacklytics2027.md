# Hacklytics 2027 (`hacklytics2027`)

Path: `sites/hacklytics2027`  
Workspace name: `hacklytics2027`  
Framework: Astro 6 (static build), React 19 islands, Tailwind 4 (`@tailwindcss/vite`)

Marketing site for Hacklytics 2027 (“Digital Bloom”). It has **no database** and **no tRPC**. Anything dynamic (interest list, registration) lives on the portal.

## Run

```bash
pnpm --filter hacklytics2027 dev        # astro dev (port 3000)
pnpm --filter hacklytics2027 build      # writes static files to out/ for Firebase Hosting
pnpm --filter hacklytics2027 preview    # serves out/
pnpm --filter hacklytics2027 typecheck  # tsc --noEmit
```

`astro check` is not used: it needs the TypeScript JavaScript API, and the repo's TypeScript 7 ships only the native compiler. `tsc --noEmit` covers `.ts` and `.tsx`; `.astro` files are checked by the build.

Astro 6 and `@astrojs/react` 5 are pinned, not Astro 7, because the root `package.json` overrides `vite` to 7 for the whole repo and Astro 7 needs Vite 8.

## Structure

| Path | Role |
| --- | --- |
| `src/pages/index.astro` | Home: hero, then the sections |
| `src/pages/404.astro` | 404 (`out/404.html`) |
| `src/layouts/Layout.astro` | `<head>` (font preloads, metadata, JSON-LD, the no-flash theme script), navbar, footer |
| `src/components/Hero.astro` | Hero. The countdown is an inline script; the garden is a React island |
| `src/components/Navbar.astro`, `Footer.astro`, `ThemeToggle.astro` | Chrome. Behaviour lives in `src/scripts/` |
| `src/components/HomeSections.astro`, `src/components/sections/*` | About, tracks, prizes, schedule, sponsors, FAQ, rendered at build time (React, no directive) |
| `src/components/pixel/*` | Pixel sprites and flower beds; `season.ts` holds the one bloom count, `GardenBeds.tsx` the four React islands |
| `src/scripts/*` | The plain scripts: `navbar`, `theme-toggle`, `bloom`, `service-worker` |
| `src/styles/globals.css`, `fonts.generated.css`, `src/lib/fonts.generated.ts`, `public/fonts/` | Styles; the fonts are output of `scripts/subset-fonts.py`, committed |
| `src/lib/links.ts` | Portal origin + interest URL |
| `public/sw.js` | Service worker (Firebase header: no-cache, `Service-Worker-Allowed: /`) |

Schedule copy lives in `src/components/sections/Schedule/data.ts`.

## JavaScript and hydration

Everything renders to HTML at build time. Only what needs the browser ships code.

| Piece | How it runs | Why |
| --- | --- | --- |
| About, tracks, prizes, schedule, sponsors, FAQ, sprites | Build time, no JS | Nothing to do after load |
| Tracks and schedule bloom | `src/scripts/bloom.ts` (about 300 bytes) | They only need `data-bloom="on"` written when 35% is in view |
| Navbar (menu, hide on scroll, section links) | `src/scripts/navbar.ts` | Plain DOM work; React would add nothing |
| Theme toggle | `src/scripts/theme-toggle.ts`; the icon follows the theme in CSS | Right icon on first paint, even before the script runs |
| Theme with no flash | `is:inline` script in `<head>` | Must run before first paint |
| Countdown | Inline script after the hero markup | Fills in the zeros during parsing, before first paint, so the figures never jump, then ticks |
| Service worker | `src/scripts/service-worker.ts`, production only, after `load` | Keeps it off the critical path |
| Hero flower bed | React island, `client:idle` | In the first screen but not needed to read it; hydrates off the critical path |
| Footer flower bed | React island, `client:visible` | Page bottom; hydrates when scrolled near |
| 404 flower bed | React island, `client:visible` | Same |
| Menu flower bed | React island, `client:media="(max-width: 1023px)"` | The menu only opens below 1024px, so desktop never loads it |

The beds are the one place React stays. How many flowers are in bloom depends on the date, so the build cannot bake it, and a click plants one. The static HTML draws every plant dormant (`useInBloom` returns 0 there) and hydration brings in the real count.

React Compiler is not enabled: the islands are small, and it would add its runtime for no change in output.

## Fonts

Instrument Sans and Silkscreen are subset by hand and committed. No font loader is used: one would regenerate the fallback metrics, and a separate family per file would put that fallback between the core and extended faces.

Each font has a **core** file (ASCII, curly quotes, dashes, ellipsis, plus `©` and `·`, which most pages use), preloaded on every page, and an **extended** file (the rest of Latin-1 and Latin Extended-A) behind `unicode-range`, which downloads only when a page needs one of its characters. Core and extended share a family name, so the browser treats them as one font.

```bash
pip install -r sites/hacklytics2027/scripts/subset-fonts.requirements.txt
python sites/hacklytics2027/scripts/subset-fonts.py          # rebuild the fonts
python sites/hacklytics2027/scripts/subset-fonts.py --check  # after astro build
```

Run `--check` after copy changes: it lists any character outside the core. Rerun the script if a character should join the core, if an axis or OpenType feature in use changes, or when the pinned upstream font moves. The header of the script has the details.

Two limits are deliberate. Kerning does not cross between the core and extended files, so accented words sit a fraction wider than they did. And `wght` keeps its full 400-700 range although the site uses 400 and 500: narrowing it rounds the fractional advances at 500 and moves glyphs.

## Driving the site from an agent

`scripts/capture-vision.mts` works for any LLM or a person at a terminal: arguments in, one JSON object out, no vendor tooling. It clicks through the page, saves screenshots to `test-results/vision/`, and returns console errors plus an accessibility tree, so a model without vision can read the page too. `--help` has the full list of steps.

```bash
pnpm --filter hacklytics2027 exec playwright install chromium   # once per machine

node sites/hacklytics2027/scripts/capture-vision.mts --url http://localhost:3000 \
  'click:text=Schedule' shot:schedule full:page
```

Call it with `node`, not `pnpm vision`: pnpm prints its own header on stdout, which breaks the JSON. It exits 1 if a step fails.

## Interest CTA

`lib/links.ts` is the only outbound destination. The Typeform URL was once pasted in four files and drifted.

Every Notify me button and link (header, mobile menu, hero, FAQ, footer) points at `INTEREST_URL`, a Typeform, for now. On phones 356px and wider the header keeps a compact Notify me button beside the menu toggle, so the CTA does not hide inside the hamburger menu.

Once registration opens on the portal, swap `INTEREST_URL` back to `PORTAL_INTEREST_URL`, which signs the visitor in first:

```
{PORTAL_ORIGIN}/login?callbackUrl=/hacklytics
```

`callbackUrl` is encoded so it survives the email-code hop through `/verify`. The portal only honors same-origin paths.

The footer also links to the portal for the two audiences that are not waiting on the list: **Hacker portal** (`PORTAL_HACKATHON_URL`, `{PORTAL_ORIGIN}/hacklytics`) and **Judge Hacklytics** (`JUDGE_URL`, sign-in with `callbackUrl=/judge`).

## Deploy

Firebase Hosting target `hacklytics`, public dir `sites/hacklytics2027/out` (`firebase.json`).

Workflow: `.github/workflows/ci.yml`. The `verify` job builds every site; `deploy-hacklytics` ships that build live on `main` and `preview-hacklytics` to channel `pr-N` on PRs. Neither runs unless `verify` passes.

Asset caching: hashed JS and CSS under `/_astro/` are `max-age=31536000, immutable`; fonts and images `max-age=86400, stale-while-revalidate=604800`; HTML `max-age=0, must-revalidate`. See `firebase.json`. The service worker caches `/_astro/` files cache-first, since their names are fingerprinted.

Images are plain `<img>` tags over files in `public/`; there is no image pipeline.

## Assets

MLH league trust badges live in the repo-root folder `trust badge/` (SVG + `.ai`). Copy into `public/` if a page needs to ship one.
