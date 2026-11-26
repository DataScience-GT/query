# Event kit (`@query/event-kit`)

Path: `packages/event-kit`. Source-only: `exports` point at `src/`, there is no build step, and each Astro site compiles it. Layer tag `ui`.

The kit is everything a Hacklytics event site has in common: the page shell, navbar, footer, every content section and the structural CSS. A site supplies one config, one theme and its own art. A new edition is those three files plus the Astro boilerplate around them.

## What the kit owns and what a site owns

| The kit owns | A site owns |
| --- | --- |
| `defineEvent` and the `EventConfig` types, with every date label computed from ISO strings in the config's `timeZone` | `src/event.config.ts`: the dates, links and copy |
| `Layout.astro`: `<head>`, meta, Open Graph and Twitter tags, the JSON-LD Event, the no-flash theme script, the navbar and footer | `src/styles/globals.css`: the palette, the two font families, the art's CSS |
| `Navbar`, `Footer`, `MlhBadge`, `ThemeToggle` and their scripts (menu, hide on scroll, theme switch, service worker registration) | The hero, the 404 body and anything else only one edition has |
| The sections `Theme`, `About`, `Tracks`, `PrizeAndSpeaker`, `Schedule`, `Judges`, `Sponsors`, `FAQ` and the `JudgeInterestForm` island, composed by `HomeSections.astro` | The art drawn into the sections: sprites, plots, the globe, the garden |
| `styles.css`: the measure, section titles, buttons, links, the badge, the theme toggle's icon swap, and the Tailwind color tokens | `public/`: favicons, the share image, the MLH badge, fonts, `sw.js` |
| `data-bloom` and `data-bloom-watch` markers on the track row and the schedule rail | The script that flips those markers when the row is in view (`src/scripts/bloom.ts`) |

2027 is the reference site. `sites/hacklytics2027` renders the same pixels as before the kit existed.

## Layout of the package

| Path | Import | What |
| --- | --- | --- |
| `src/config.ts` | `@query/event-kit` | `defineEvent` and the types |
| `src/dates.ts` | `@query/event-kit/dates` | Date labels, day columns, schedule rail positions, calendar-day counts, the application deadline and which schedule day to open on |
| `src/components/*.astro`, `*.tsx` | `@query/event-kit/components/<File>` | Layout, chrome and sections |
| `src/styles/kit.css` | `@query/event-kit/styles.css` | Structural CSS and color tokens |
| `src/scripts/*.ts` | (bundled by the components) | Navbar, theme toggle, service worker, schedule day tabs |
| `src/tabs.ts` | (internal) | Which tab an arrow, Home or End key moves to |
| `src/nav.ts` | (internal) | The section ids and labels the navbar and footer link to |

The package has no `sideEffects` field on purpose. The components load their scripts with a bare `import "../scripts/navbar"`, and a `sideEffects: false` package lets the bundler drop that import, which leaves the navbar and theme toggle dead with no error.

## Using the kit in a site

A new edition does not start by hand: `pnpm turbo gen hacklytics` makes the site with all five steps below done and wires its deploy. See [Starting a new edition](./new-edition.md).

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
- **React components on `HomeSections`.** `art` takes `theme` (the picture beside the theme block), `track` (receives `{ track, index }`, drawn in the cell above each track's words), `railStart` and `railEnd` (the two ends of the schedule rail), and `judges` and `sponsors` (the plot under each title). Each is rendered at build time, with no hydration. A section without its art lays out the same, with an empty cell.

The schedule shows one day at a time, as tabs under the rail. They are progressive enhancement: the page is built with the tabs hidden and every day showing, and `scripts/schedule-days.ts` turns that into an ARIA tablist (arrow keys, Home and End, `aria-selected`, `aria-controls`) that opens on today's day while the event is on and on the first day otherwise. With no JavaScript the days stay side by side from md.

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
| `closes`, `closesMs` | `{ weekday: "Thu", label: "Jan 20", long: "January 20", year: 2027, time: "11:59 PM", zone: "EST" }`, epoch milliseconds. Only when `registration.closes` is set | Copy ("Apply by January 20"), the hero's deadline |
| `links.portalInterest`, `.hackerPortal`, `.judgeSignIn`, `.judgeApply` | `{portal}/login?callbackUrl=...`; `hackerPortal` is `{portal}{portalPath}` and `portalInterest` signs in to `portalPath` | Buttons, copy |

`hackHours` is elapsed time, and the rail is clock time, so across a daylight-saving change a window that reads 9 PM to 9 AM is 35 hours long and still ends at hour 57.

`@query/event-kit/dates` exports the date helpers a site script can use in the browser: `describeMoment` (an instant as the venue's clock shows it), `calendarDaysUntil` (calendar days, not 24-hour blocks, so a day with a clock change in it is still one day) and `deadlineStatus` (open or closed, and how many days are left). 2027's hero uses them to count days to the application deadline and, once it has passed, to say applications are closed.

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
| `links` | `{ portal, portalPath, devPortal?, mlh, devpost?, codeOfConduct?, social[] }` | `portal` is an origin with no trailing slash. `portalPath` is the edition's page on the portal, `/hacklytics` for 2027: a leading slash, no trailing one. `devPortal` is a local portal's origin: on a loopback host the judge-interest form posts there instead of to `portal`, so trying it in dev never touches the real list (2027 sets `http://localhost:3001`). `devpost` adds a footer link. `codeOfConduct` is `{ label, href }`, a footer link with that text; a site that also links it from the FAQ reuses its own constant. `social` is `{ label, href }` in footer order |
| `registration` | `{ url, label, ariaLabel?, availability, validFrom, closes?, price, currency }` | One URL for every sign-up button and the JSON-LD offer. `closes` is an ISO string with an offset: when applications close. It is optional; without it the page shows no deadline. `availability` is `PreOrder`, `InStock` or `SoldOut`. `price` is a decimal string and `currency` an ISO 4217 code: `"0"` and `USD` for a free event |

**`EventContent`**, returned by `content(derived)`

| Field | Type |
| --- | --- |
| `seo` | `{ tagline, description, shareDescription, summary, eventDescription, keywords[], url, image, twitter }` |
| `about` | `{ heading, body: Rich[], theme?: Rich[] }`: the first paragraph leads, the rest are secondary. `theme` is what the theme is and why the edition has it: a block under the hero titled with `theme.name`, drawn only when it is set |
| `tracks` | `{ title, description }[]` |
| `prizes` | `{ intro, items: { label, detail }[] }` |
| `speakers` | `{ name, title?, company? }[]`: a Speakers block under the prizes when there are any |
| `schedule` | `{ intro, board: { when, event, accent? }[] }`: `when` starts with a day's three-letter weekday |
| `judges` | `{ body: Rich[], people: { name, title?, company? }[] }`: the apply button follows `body`, `people` follow the button |
| `sponsors` | `{ body: Rich[], tiers: { name, sponsors: { name, url?, logo? }[] }[] }`: logos sit on a `--logo-tile` tile in either theme |
| `faqs` | `{ q, a: Rich }[]`, split in two columns at the halfway point |
| `footer` | `{ headline, note?, closed?: { headline, note?, cta: { text, href, external? } } }`. `closed` is what the footer says once `registration.closes` has passed, in place of the headline, note and Apply button: the Apply link has gone stale, so `cta` points somewhere else (2027: the schedule). It is decided when the site is built and again when the page loads, with the same `deadlineStatus` as the hero. Needs `registration.closes` |

`Rich` is a string, or an array of strings and `{ text, href, external? }` links in reading order. Write the space beside a link inside the neighbouring string.

`defineEvent` throws, so the site build fails, when:

- a timestamp has no offset, or `end` is not after `start`
- `timeZone` is not a zone the runtime knows, or `year` is not the year of `start` there
- the hacking window is not inside the event, or ends before it starts
- a schedule row starts with a weekday the event does not run on
- two tracks, prizes or FAQs share a title or question
- `registration.price` is not a decimal, or `registration.currency` is not a three-letter code
- `registration.closes` is not after `registration.validFrom`, or is after `start`
- `footer.closed` is set without `registration.closes`
- `links.portal`, `links.devPortal` or `seo.url` is not a bare origin, `links.portalPath` is not a slash-led path, a `ground` color is not `#rrggbb`, or `theme.storageKey` has characters the inline script cannot hold

## Theme contract

The kit's components use Tailwind utilities and classes over these names. The site's theme CSS defines their values, once for night and once for day, using the same selectors as 2027: `:root`, `:root[data-theme="light"]`, and `@media (prefers-color-scheme: light)` for `:root:not([data-theme="dark"])`.

| Custom property | Role |
| --- | --- |
| `--ground`, `--raised` | Page background, form field background |
| `--ink`, `--ink-2`, `--ink-3` | Primary, body and meta text |
| `--rule`, `--line-border` | Hairline rules, control borders |
| `--bloom`, `--bloom-hover`, `--bloom-deep`, `--on-bloom`, `--on-bloom-deep` | The one accent and the text on it. `--on-bloom-deep` is the label on the pressed button, over `--bloom-deep` |
| `--sage` | The secondary accent, the rule under the art plots |
| `--logo-tile` | The tile sponsor logos sit on. Logos are drawn for white, so it is white in either theme |
| `--badge-edge` | The MLH badge's edge on the light ground |
| `--navbar-height`, `--ease` | The fixed header's height and the one easing curve |

The site also maps the two families in its own `@theme inline`: `--font-display` for titles and `--font-sans` for text.

`kit.css` registers `@source "../"`, which makes Tailwind scan the kit's components. Tailwind only scans the importing site's folder otherwise, and the utilities the kit uses would be missing from the page.

## What the kit fixes on purpose

Nothing that differs between editions is a literal in the kit. These are the same for every edition, so they are literals: changing one is a kit change, not a config change.

- **Files in the site's `public/`.** `favicon.ico`, `apple-icon.png`, `mlh-trust-badge.svg` (preloaded by `Layout`, shown by `MlhBadge`) and `sw.js`, plus the file `seo.image` names. A site ships files with these names.
- **Portal routes.** `/login?callbackUrl=`, `/judge`, `/judge/register` and `POST {portal}/api/judge-interest`. They are the portal app's contract with every edition. Only the edition's own page, `links.portalPath`, is config.
- **Language and share image.** `lang="en"`, `og:locale` `en_US` and the 1200 by 630 share image size. The kit's own copy is English.
- **Schema.org vocabulary.** The JSON-LD says an in-person, scheduled event. `venue` is required, so the kit assumes a physical place.
- **The kit's own copy.** The button and form labels ("Apply to judge", "Hacker portal", "Devpost", "Keep me posted"), the form's placeholders, and the section ids and labels in `nav.ts`.
- **Token and attribute names.** `bloom` and `sage` name the accent roles, `data-bloom` marks the art that animates, and the display face's letter-spacing (`-0.125em`) is tuned for a pixel face.

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
