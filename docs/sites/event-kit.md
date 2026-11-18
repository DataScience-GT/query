# Event kit (`@query/event-kit`)

Path: `packages/event-kit`. Source-only: `exports` point at `src/`, there is no build step, and each Astro site compiles it. Layer tag `ui`.

The kit is everything a Hacklytics event site has in common: the page shell, navbar, footer, every content section and the structural CSS. A site supplies one config, one theme and its own art. A new edition is those three files plus the Astro boilerplate around them.

## What the kit owns and what a site owns

| The kit owns | A site owns |
| --- | --- |
| `defineEvent` and the `EventConfig` types, with every date label computed from ISO strings in the config's `timeZone` | `src/event.config.ts`: the dates, links and copy |
| `Layout.astro`: `<head>`, meta, Open Graph and Twitter tags, the JSON-LD Event, the no-flash theme script, the navbar and footer | `src/styles/globals.css`: the palette, the two font families, the art's CSS |
| `Navbar`, `Footer`, `MlhBadge`, `ThemeToggle` and their scripts (menu, hide on scroll, theme switch, service worker registration) | The hero, the 404 body and anything else only one edition has |
| The sections `About`, `Tracks`, `PrizeAndSpeaker`, `Schedule`, `Judges`, `Sponsors`, `FAQ` and the `JudgeInterestForm` island, composed by `HomeSections.astro` | The art drawn into the sections: sprites, plots, the globe, the garden |
| `styles.css`: the measure, section titles, buttons, links, the badge, the theme toggle's icon swap, and the Tailwind color tokens | `public/`: favicons, the share image, the MLH badge, fonts, `sw.js` |
| `data-bloom` and `data-bloom-watch` markers on the track row and the schedule rail | The script that flips those markers when the row is in view (`src/scripts/bloom.ts`) |

2027 is the reference site. `sites/hacklytics2027` renders the same pixels as before the kit existed.

## Layout of the package

| Path | Import | What |
| --- | --- | --- |
| `src/config.ts` | `@query/event-kit` | `defineEvent` and the types |
| `src/dates.ts` | (internal) | Date labels, day columns and schedule rail positions |
| `src/components/*.astro`, `*.tsx` | `@query/event-kit/components/<File>` | Layout, chrome and sections |
| `src/styles/kit.css` | `@query/event-kit/styles.css` | Structural CSS and color tokens |
| `src/scripts/*.ts` | (bundled by the components) | Navbar, theme toggle, service worker |
| `src/nav.ts` | (internal) | The section ids and labels the navbar and footer link to |

The package has no `sideEffects` field on purpose. The components load their scripts with a bare `import "../scripts/navbar"`, and a `sideEffects: false` package lets the bundler drop that import, which leaves the navbar and theme toggle dead with no error.

## Using the kit in a site

1. `package.json`: depend on `"@query/event-kit": "workspace:*"`.
2. `src/event.config.ts`: `export default defineEvent({...})`.
3. `src/styles/globals.css`: import Tailwind, then the kit CSS, then define the palette.

   ```css
   @import "tailwindcss";
   @import "@query/event-kit/styles.css";
   ```

4. `src/layouts/Layout.astro`: wrap the kit layout. This is where the site's CSS, font preloads and art slots meet the kit.

   ```astro
   <EventLayout event={event} home={home} fontPreloads={FONT_PRELOADS}>
     <slot name="head" slot="head" />
     <Fragment slot="menu-art"><MenuBed client:media="(max-width: 1023px)" start={event.startMs} /></Fragment>
     {home && <Fragment slot="footer-art">...</Fragment>}
     <slot />
   </EventLayout>
   ```

5. `src/pages/index.astro`: the hero, then `<HomeSections event={event} art={art} />`.

`MlhBadge` is a kit component the hero and the 404 place themselves, since where it hangs is page layout.

### Slots and art

The kit never imports a site's art. It takes it two ways.

- **Astro slots on `Layout`.** `head` for extra `<head>` tags, `menu-art` for the art at the foot of the mobile menu, `footer-art` for the art that closes the home page, and the default slot for the page. Hydrated islands go in a slot like any other child.
- **React components on `HomeSections`.** `art` takes `track` (receives `{ track, index }`, drawn in the cell beside each track), `railStart` and `railEnd` (the two ends of the schedule rail), and `judges` and `sponsors` (the plot under each title). Each is rendered at build time, with no hydration. A section without its art lays out the same, with an empty cell.

The boxes that hold art set `--bed: 1`, doubled from `sm` or `md`, so a sprite scales in whole pixels. Art that wants to follow that reads `var(--bed, 1)`.

Islands cannot import the config. `event.config.ts` carries the whole page's copy, and an island that imports it ships that copy to every visitor. Pass islands the few values they need as props. The 2027 beds take `start` (epoch milliseconds) and `startLabel`.

## Dates

`start` and `end` are ISO 8601 strings with an offset, such as `2027-02-26T17:00:00-05:00`. Everything else about the schedule is derived from them in the venue's `timeZone`, an IANA name such as `America/New_York`. A timestamp written in UTC (`2027-02-27T03:00:00Z`) gives the day it falls on in that zone, so `Feb 26` for New York and `Feb 27` for `Asia/Tokyo`.

| Derived | Example | Used by |
| --- | --- | --- |
| `name` | `Hacklytics 2027` | Title, meta, FAQ copy |
| `headline` | `Hacklytics 2027: Digital Bloom` | Title, Open Graph, JSON-LD |
| `dates.short`, `dates.long` | `Feb 26–28, 2027`, `February 26–28, 2027` | Hero, copy |
| `dates.startLabel`, `dates.endLabel` | `Feb 26`, `Feb 28` | Copy, bed caption |
| `dates.days` | `{ key: "Fri", name: "Friday", label: "Feb 26" }`, one per calendar day | Schedule columns |
| `hackHours` | `36` | Copy, the rail's label |
| `schedule.rail` | `{ span: 72, from: 21, to: 57 }` | Schedule rail positions |
| `startMs`, `endMs` | epoch milliseconds | Countdown, season |
| `links.portalInterest`, `.hackerPortal`, `.judgeSignIn`, `.judgeApply` | `{portal}/login?callbackUrl=...` | Buttons, copy |

`hackHours` is elapsed time, and the rail is clock time, so across a daylight-saving change a window that reads 9 PM to 9 AM is 35 hours long and still ends at hour 57.

## EventConfig

`defineEvent(input)` takes an `EventCore` plus a `content` function, and returns an `EventConfig`. The function receives the derived values, so copy can say `${dates.long}` without typing a date. Lists marked non-empty are typed so an empty list does not compile.

**`EventCore`**

| Field | Type | Notes |
| --- | --- | --- |
| `brand` | string | The series: `Hacklytics`. Navbar logo, `og:site_name`, "Judge Hacklytics" |
| `year` | number | Must be the year of `start` in `timeZone` |
| `timeZone` | string | The venue's IANA time zone. Day names, date labels and the schedule rail read the calendar and clock there |
| `theme` | `{ name, storageKey, ground: { light, dark } }` | `ground` is the `#rrggbb` page color, used for the browser bar. It must equal `--ground` in the theme CSS. `storageKey` is the localStorage key for a saved light or dark choice: letters, digits and `_ . : -`. Give every edition on an origin the same key so a returning visitor keeps their pick (2027 uses `hl-theme`) |
| `start`, `end` | ISO string | `end` must be after `start` |
| `hacking` | `{ start, end }` | ISO strings inside `start` to `end`. Positions the schedule rail |
| `venue` | `{ name, address: { street, locality, region, postalCode, country } }` | The JSON-LD place |
| `organizer` | `{ name }` | Footer copyright, `author`, JSON-LD organizer |
| `contactEmail` | string | Footer, form errors |
| `links` | `{ portal, mlh, devpost?, codeOfConduct?, social[] }` | `portal` is an origin with no trailing slash. `devpost` adds a footer link. `codeOfConduct` is `{ label, href }`, a footer link with that text; a site that also links it from the FAQ reuses its own constant. `social` is `{ label, href }` in footer order |
| `registration` | `{ url, label, ariaLabel?, availability, validFrom }` | One URL for every sign-up button and the JSON-LD offer. `availability` is `PreOrder`, `InStock` or `SoldOut` |

**`EventContent`**, returned by `content(derived)`

| Field | Type |
| --- | --- |
| `seo` | `{ tagline, description, shareDescription, summary, eventDescription, keywords[], url, image, twitter }` |
| `about` | `{ heading, body: Rich[] }`: the first paragraph leads, the rest are secondary |
| `tracks` | `{ title, description }[]` |
| `prizes` | `{ intro, items: { label, detail }[] }` |
| `speakers` | `{ name, title?, company? }[]`: a Speakers block under the prizes when there are any |
| `schedule` | `{ intro, board: { when, event, accent? }[] }`: `when` starts with a day's three-letter weekday |
| `judges` | `{ body: Rich[], people: { name, title?, company? }[] }`: the apply button follows `body`, `people` follow the button |
| `sponsors` | `{ body: Rich[], tiers: { name, sponsors: { name, url?, logo? }[] }[] }`: logos sit on a white tile in either theme |
| `faqs` | `{ q, a: Rich }[]`, split in two columns at the halfway point |
| `footer` | `{ headline, note? }` |

`Rich` is a string, or an array of strings and `{ text, href, external? }` links in reading order. Write the space beside a link inside the neighbouring string.

`defineEvent` throws, so the site build fails, when:

- a timestamp has no offset, or `end` is not after `start`
- `timeZone` is not a zone the runtime knows, or `year` is not the year of `start` there
- the hacking window is not inside the event, or ends before it starts
- a schedule row starts with a weekday the event does not run on
- two tracks, prizes or FAQs share a title or question
- `links.portal` or `seo.url` is not a bare origin, a `ground` color is not `#rrggbb`, or `theme.storageKey` has characters the inline script cannot hold

## Theme contract

The kit's components use Tailwind utilities and classes over these names. The site's theme CSS defines their values, once for night and once for day, using the same selectors as 2027: `:root`, `:root[data-theme="light"]`, and `@media (prefers-color-scheme: light)` for `:root:not([data-theme="dark"])`.

| Custom property | Role |
| --- | --- |
| `--ground`, `--raised` | Page background, form field background |
| `--ink`, `--ink-2`, `--ink-3` | Primary, body and meta text |
| `--rule`, `--line-border` | Hairline rules, control borders |
| `--bloom`, `--bloom-hover`, `--bloom-deep`, `--on-bloom` | The one accent and the text on it |
| `--sage` | The secondary accent, the rule under the art plots |
| `--badge-edge` | The MLH badge's edge on the light ground |
| `--navbar-height`, `--ease` | The fixed header's height and the one easing curve |

The site also maps the two families in its own `@theme inline`: `--font-display` for titles and `--font-sans` for text.

`kit.css` registers `@source "../"`, which makes Tailwind scan the kit's components. Tailwind only scans the importing site's folder otherwise, and the utilities the kit uses would be missing from the page.

## What stays out of the kit

- **Art and its CSS.** The 2027 pixel sprites, the flower animations and the hero globe belong to Digital Bloom.
- **Hero and 404 content.** They are the most edition-specific pages, and they compose kit parts (`MlhBadge`, the layout) instead of being one.
- **Fonts.** A site decides its fonts and passes the preloads to the layout.
- **Section order.** `HomeSections` renders the standard order. A site that needs another order composes the section components itself.

## Parity check

The kit was introduced without visible change to the 2027 site. The check that proved it, and that a later edit to the kit can rerun against any site:

1. Build the site before the change and serve `out/` statically.
2. Capture full-page Playwright screenshots of `/` and `/404` at 375, 768 and 1280 px, in light and dark, with `reducedMotion: "reduce"`, fonts loaded, every island hydrated and the clock frozen with `page.clock.setFixedTime` (the countdown and the bloom count both read the date). Add the open mobile menu and an opened FAQ.
3. Rebuild after the change, capture the same set and compare pixel by pixel with `pixelmatch` at threshold 0. Compare the JSON-LD string and the visible text of the built HTML too.

The scripts for this are not committed.
