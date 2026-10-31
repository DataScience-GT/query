# Hacklytics 2027 (`hacklytics2027`)

Path: `sites/hacklytics2027`  
Workspace name: `hacklytics2027`  
Framework: Next.js 16, React 19, Tailwind 4, **static export** (`output: "export"`)

Marketing site for Hacklytics 2027 (“Digital Bloom”). It has **no database** and **no tRPC**. Anything dynamic (interest list, registration) lives on the portal.

## Run

```bash
pnpm --filter hacklytics2027 dev     # next dev (port 3000)
pnpm --filter hacklytics2027 build   # writes static files for Firebase Hosting
```

## Structure

| Path | Role |
| --- | --- |
| `app/page.tsx` | Home: a server component around the hero and sections |
| `components/Hero.tsx` | Pixel garden hero and countdown |
| `app/layout.tsx` | Font preloads, metadata, SW registrar |
| `app/fonts.generated.css`, `lib/fonts.generated.ts`, `public/fonts/` | Output of `scripts/subset-fonts.py`, committed |
| `app/not-found.tsx` | 404 |
| `components/HomeSections.tsx` | Below-the-fold sections |
| `components/sections/*` | About, tracks, schedule, prizes/speakers, FAQ, sponsors |
| `components/pixel/*` | Pixel sprites / garden; `season.ts` holds the one bloom count |
| `components/Navbar.tsx`, `Footer.tsx` | Chrome |
| `lib/links.ts` | Portal origin + interest URL |
| `public/sw.js` | Service worker (Firebase header: no-cache, `Service-Worker-Allowed: /`) |

Schedule copy lives in `components/sections/Schedule/data.ts`.

## Fonts

Instrument Sans and Silkscreen are subset by hand and committed. `next/font` is not used: it would regenerate the fallback metrics, and a separate family per file would put that fallback between the core and extended faces.

Each font has a **core** file (ASCII, curly quotes, dashes, ellipsis, plus `©` and `·`, which most pages use), preloaded on every page, and an **extended** file (the rest of Latin-1 and Latin Extended-A) behind `unicode-range`, which downloads only when a page needs one of its characters. Core and extended share a family name, so the browser treats them as one font.

```bash
pip install -r sites/hacklytics2027/scripts/subset-fonts.requirements.txt
python sites/hacklytics2027/scripts/subset-fonts.py          # rebuild the fonts
python sites/hacklytics2027/scripts/subset-fonts.py --check  # after next build
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

Asset caching: hashed JS and CSS `max-age=31536000, immutable`; fonts and images `max-age=86400, stale-while-revalidate=604800`, including those under `_next/static`, because the later rule wins; HTML `max-age=3600`. See `firebase.json`.

Images are `unoptimized: true` because static export has no image optimizer. React Compiler is on.

## Assets

MLH league trust badges live in the repo-root folder `trust badge/` (SVG + `.ai`). Copy into `public/` if a page needs to ship one.
