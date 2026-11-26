# Hacklytics 2027 (`hacklytics2027`)

Path: `sites/hacklytics2027`  
Workspace name: `hacklytics2027`  
Framework: Astro 7 (static build), React 19 islands, Tailwind 4 (`@tailwindcss/vite`)

Marketing site for Hacklytics 2027 (“Digital Bloom”). It has **no database** and **no tRPC**. Anything dynamic (interest list, registration) lives on the portal.

The page shell, navbar, footer and content sections come from [`@query/event-kit`](./event-kit.md). This site owns the edition's config (`src/event.config.ts`), its theme CSS, the hero and the pixel art. A new edition follows the same split.

## Run

```bash
pnpm --filter hacklytics2027 dev        # astro dev (port 3000)
pnpm --filter hacklytics2027 build      # writes static files to out/ for Firebase Hosting
pnpm --filter hacklytics2027 preview    # serves out/
pnpm --filter hacklytics2027 typecheck  # tsc --noEmit
```

`astro check` is not used: it needs the TypeScript JavaScript API, and the repo's TypeScript 7 ships only the native compiler. `tsc --noEmit` covers `.ts` and `.tsx`; `.astro` files are checked by the build.

Astro 7 needs Vite 8 while the rest of the repo stays on Vite 7. This site and `hacklytics2026` list `vite` from the `astro` catalog (8.3.5), because `@astrojs/react` takes Vite as a peer from the site. The scoped overrides `astro>vite` and `@vitejs/plugin-react>vite` keep Astro's own copies on the same version, and the repo-wide `vite@<7.3.7` override is only a floor, so it does not pull the sites back to 7. Astro 6 is not an option: GHSA-26w7-cxv4-gfx2 (AVIF RCE) affects every version below 7.2.8.

## Structure

| Path | Role |
| --- | --- |
| `src/event.config.ts` | The edition: `defineEvent` with the dates, links and every line of page copy. [Field reference](./event-kit.md#eventconfig) |
| `src/pages/index.astro` | Home: hero, then the kit's `HomeSections` with this site's art |
| `src/pages/404.astro` | 404 (`out/404.html`) |
| `src/layouts/Layout.astro` | Wraps the kit's layout: loads the CSS and font preloads, and puts the menu and footer flower beds in the kit's slots |
| `src/components/Hero.astro` | Hero. The countdown is an inline script; the garden is a React island |
| `src/components/SectionArt.tsx` | The plants drawn into the kit's sections: the theme block's seed, bud and bloom, one per track in a box of 16 by 11 sprite pixels, each in its own tint, the Judges and Sponsors plots, the schedule rail's bud and tulip |
| `src/components/pixel/*` | Pixel sprites and flower beds; `season.ts` holds the one bloom count, `GardenBeds.tsx` the four React islands, `tints.ts` the colours a flower opens in |
| `src/scripts/bloom.ts` | Writes `data-bloom="on"` on the track row and the schedule rail when they are in view |
| `src/styles/globals.css`, `fonts.generated.css`, `src/lib/fonts.generated.ts`, `public/fonts/` | The theme (palette, fonts, flower animations); the fonts are output of `scripts/subset-fonts.py`, committed |
| `public/sw.js` | Service worker (Firebase header: no-cache, `Service-Worker-Allowed: /`) |

The navbar, footer, theme toggle, MLH badge and the About, Tracks, Prizes, Schedule, Judges, Sponsors and FAQ sections live in `packages/event-kit`, and render at build time (React, no directive). Schedule, tracks, prizes and FAQ copy are in `src/event.config.ts`.

## JavaScript and hydration

Everything renders to HTML at build time. Only what needs the browser ships code.

| Piece | How it runs | Why |
| --- | --- | --- |
| About, tracks, prizes, schedule, sponsors, FAQ, sprites | Build time, no JS | Nothing to do after load |
| Tracks and schedule bloom | `src/scripts/bloom.ts` (about 300 bytes) | They only need `data-bloom="on"` written when 35% is in view |
| Navbar (menu, hide on scroll, section links) | `packages/event-kit/src/scripts/navbar.ts` | Plain DOM work; React would add nothing |
| Theme toggle | `packages/event-kit/src/scripts/theme-toggle.ts`; the icon follows the theme in CSS | Right icon on first paint, even before the script runs |
| Theme with no flash | `is:inline` script in `<head>` | Must run before first paint |
| Countdown | Inline script after the hero markup | Fills in the zeros during parsing, before first paint, so the figures never jump, then ticks |
| Service worker | `packages/event-kit/src/scripts/service-worker.ts`, production only, after `load` | Keeps it off the critical path |
| Hero flower bed | React island, `client:idle` | In the first screen but not needed to read it; hydrates off the critical path |
| Footer flower bed | React island, `client:visible` | Page bottom; hydrates when scrolled near |
| 404 flower bed | React island, `client:visible` | Same |
| Menu flower bed | React island, `client:media="(max-width: 1023px)"` | The menu only opens below 1024px, so desktop never loads it |

The beds are the one place React stays, besides the judge interest form. How many flowers are in bloom depends on the date, so the build cannot bake it, and a click plants one. The static HTML draws every plant dormant (`useInBloom` returns 0 there) and hydration brings in the real count.

Flowers open in the portal’s eight flower tints, which `@query/core` exports as `BLOOM_TINTS` (the portal’s bloom pass reads the same table). Only flowers use them: buttons, links and focus stay the one pink. In a bed the first eight flowers in bloom are all different colours, and a flower you plant takes a random one.

The beds take the event's start (`start`, epoch milliseconds) and first-day label (`startLabel`) as props, passed from `Hero.astro` and `layouts/Layout.astro`. They do not import `event.config.ts`: an island that imports it bundles all the page copy into the browser.

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

`registration.url` in `src/event.config.ts` is the only sign-up destination. The Typeform URL was once pasted in four files and drifted.

Every Notify me button and link (header, mobile menu, hero, FAQ, footer) points at it, a Typeform, for now. On phones 356px and wider the header keeps a compact Notify me button beside the menu toggle, so the CTA does not hide inside the hamburger menu.

Once registration opens on the portal, set `registration.url` to the portal's interest form, `event.links.portalInterest`, which signs the visitor in first:

```
{links.portal}/login?callbackUrl=/hacklytics
```

`callbackUrl` is encoded so it survives the email-code hop through `/verify`. The portal only honors same-origin paths.

The footer also links to the portal for the two audiences that are not waiting on the list: **Hacker portal** (`links.hackerPortal`, `{links.portal}/hacklytics`) and **Judge Hacklytics** (`links.judgeSignIn`, sign-in with `callbackUrl=/judge`). The kit derives all four links from `links.portal`.

## Judge interest form

Below the Judges section, the kit's `JudgeInterestForm` (`packages/event-kit/src/components/JudgeInterestForm.tsx`, a React island, `client:visible`) collects name, email, company, title, expertise, LinkedIn and a note, with no account. It posts JSON to `{links.portal}/api/judge-interest` (`judgeInterestUrl()` in the same file; on `localhost` it posts to `links.devPortal` from the event config, `http://localhost:3001`, so dev never touches the real list). The "Apply to judge" button above stays the full application.

The endpoint is a portal route handler, so the portal must be deployed for the form to work. It allows only this site's origins, rate limits per IP and has a hidden honeypot field; see [Judge portal](../features/judge-portal.md#judge-interest-leads). Organizers read the list at `/admin/judging/interest`.

## Deploy

Firebase Hosting target `hacklytics`, public dir `sites/hacklytics2027/out` (`firebase.json`).

Workflow: `.github/workflows/ci.yml`. The `verify` job builds every site; `deploy-hacklytics` ships that build live on `main` and `preview-hacklytics` to channel `pr-N` on PRs. Neither runs unless `verify` passes.

Asset caching: hashed JS and CSS under `/_astro/` are `max-age=31536000, immutable`; fonts and images `max-age=86400, stale-while-revalidate=604800`; HTML `max-age=0, must-revalidate`. See `firebase.json`. The service worker caches `/_astro/` files cache-first, since their names are fingerprinted.

Images are plain `<img>` tags over files in `public/`; there is no image pipeline.

## Assets

MLH league trust badge sources live in `sites/hacklytics2027/mlh-trust-badges/` (SVG + `.ai`). The folder is outside `public/`, so nothing in it ships. Copy into `public/` if a page needs to ship one.
