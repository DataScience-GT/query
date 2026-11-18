# Starting a new Hacklytics edition

One command makes a working `sites/hacklytics<year>` on the [event kit](./event-kit.md) and wires its deploy. You then edit two files.

```bash
pnpm turbo gen hacklytics
```

The generator is `turbo/generators/hacklytics/`, with its templates in `turbo/generators/templates/hacklytics/`. It needs no database.

## The prompts

| Prompt | Answer | Checked |
| --- | --- | --- |
| Year | Four digits. Defaults to the latest edition plus one | Must be greater than every existing `sites/hacklytics<year>` |
| Theme name | Free text, such as `Digital Bloom` | Not empty, up to 60 characters |
| Start date | `YYYY-MM-DD`, the day check-in opens | A real date, in the year above |
| End date | `YYYY-MM-DD`, the day the weekend closes | A real date, and the weekend runs in order with the latest edition's times |
| Copy the theme from the latest edition? | Yes (default) or no | |

A bad answer is refused before any file is touched.

### Without the prompts

`--args` takes the answers in prompt order.

```bash
pnpm turbo gen hacklytics --args 2028 "Digital Bloom" 2028-02-25 2028-02-27 yes
```

The last answer is `yes` or `no`. Use it in scripts and when an agent runs the command.

## What it reads, so you do not retype it

The generator holds no venue, link, contact, organizer, clock time or Firebase target of its own. It loads the latest edition's `src/event.config.ts` through the kit and carries every field over. A field the kit adds to the config later is carried over too.

| Carried over from the latest edition | How |
| --- | --- |
| `brand`, `timeZone`, `venue`, `organizer`, `contactEmail`, `links` (the portal and its path, the local portal, MLH, the code of conduct, social), `registration` (the sign-up URL, label, price and currency), `theme.storageKey`, and any other core field the answers do not decide | As they are |
| `seo.tagline`, `keywords`, `url`, `image`, `twitter` | As they are. The four description fields are new copy |
| The clock times | Read as a pattern from `start`, `end` and `hacking`: the clock time of each, and the day each falls on relative to the start or end date. The pattern is laid on your dates |
| `registration.validFrom` | The same month, day and time, moved to the new year |
| The time zone | `timeZone` in the latest edition's config |
| The files a site must serve, and the theme tokens it must define | Read from the kit's components and from the header of its stylesheet, so a file or token the kit adds is picked up |

The ISO strings get the offset the zone has on that date. A weekend in late March is `-04:00` and one in February is `-05:00`. A clock time the zone skips is refused.

Check `registration.url`, `registration.validFrom` and `links.mlh` before launch. They belong to one season, and they are copied as they were. The header of the generated `event.config.ts` lists everything that was carried over.

## What it makes

```
sites/hacklytics<year>/
  package.json            name changed; dependencies as the latest edition has them
  astro.config.mjs  tsconfig.json  turbo.json  oxlint.config.mts  .gitignore  README.md
  src/event.config.ts     the dates and theme you gave, carried fields, TODO copy
  src/layouts/Layout.astro  src/pages/index.astro  src/pages/404.astro
  src/styles/globals.css  the theme
  public/                 favicon.ico, apple-icon.png, mlh-trust-badge.svg, sw.js, the share image
```

With the theme copied, it also copies `public/fonts/`, `src/styles/fonts.generated.css` and `src/lib/fonts.generated.ts`, and `globals.css` holds the latest edition's palette and font families without its art. Without, `globals.css` is a neutral starter. It has system fonts, one blue accent and a palette that clears WCAG AA in both schemes, and the config's `theme.ground` matches it. Tokens that are not colors, such as `--navbar-height` and `--ease`, come from the latest edition's theme. A color token the kit starts to require fails the generator's tests until it is added to the starter.

The page is the kit's. `index.astro` has a plain placeholder hero and then `HomeSections`. `404.astro` is a plain 404. Art is optional, so none is made.

Every line of page copy that is new for an edition is a `TODO` in `event.config.ts`. They are written to satisfy the kit's non-empty lists, so the site builds and renders before you touch them.

## What it changes outside the site

The Firebase target `hacklytics` serves the latest edition. Each older edition keeps a target of its own, named after the live target and its year. Making a new edition live turns the previous one into an archive.

| File | Change |
| --- | --- |
| `firebase.json` | The live entry's `public` moves to the new site's `out/`. The previous edition gets an entry of its own, a copy of the live entry as it stood, with target `hacklytics<previous year>`. It goes right after the live entry |
| `.firebaserc` | The new archive target maps to the Hosting site id `hacklytics<previous year>-archive`, next to the live target |
| `.github/workflows/ci.yml` | `verify` uploads the new site's `out/` as the live artifact. The previous edition gets an upload step and its own `preview-` and `deploy-` jobs, copied from the newest archive's jobs. The live jobs download the new site |
| `pnpm-lock.yaml` | `pnpm install` adds the new workspace |

Each edit finds what it needs in the file (the live target, the site directories, the newest archive's jobs) and does nothing when its edit is already there. If a run stops partway, run it again.

Commit the lockfile with the site. CI installs with `--frozen-lockfile`.

## The one step that is yours

Create the Firebase Hosting site for the archive target. The generator prints it:

1. In the Firebase console, open project `dsgt-website`, then Hosting, then Add another site.
2. Use the site id the generator printed, `hacklytics<previous year>-archive`. Or put the id of a site that exists into `.firebaserc` under `hacklytics<previous year>`.

Until the site exists, the `deploy-hacklytics<previous year>` job fails on `main`. The live deploy does not depend on it.

## What to edit next

1. `src/event.config.ts`. Search for `TODO`. Check the carried fields. [Field reference](./event-kit.md#eventconfig).
2. `src/styles/globals.css`. Choose the palette. `--ground` must equal `theme.ground` for each scheme.
3. In `public/`, replace the share image and `mlh-trust-badge.svg`, which names MLH's season. Both are copied.
4. Give `src/pages/index.astro` a hero. Add art through the kit's slots if you want some ([Slots and art](./event-kit.md#slots-and-art)).

Then run it.

```bash
pnpm --filter hacklytics<year> dev
pnpm turbo run lint typecheck build --filter=hacklytics<year>
```

## Docs to update by hand

The generator does not touch prose. A new edition leaves these stale.

- `docs/operations/deployment.md` and `docs/operations/ci-cd.md`, which list the targets, artifacts and jobs by year.
- The Deploy section of the previous edition's page, `docs/sites/hacklytics<previous year>.md`.
- The `app` row of the table in `docs/architecture.md`, and the Sites table in `docs/README.md`.

## If it stops or refuses

| What you see | What it means |
| --- | --- |
| `<year> must be greater than the latest edition` | A directory for that year, or a later one, exists. To redo a run that stopped after creating the site, delete the site directory and restore `firebase.json`, `.firebaserc`, `ci.yml` and `pnpm-lock.yaml` with `git checkout` |
| `With the latest edition's times, the weekend would not run in order` | The end date is too close to the start. The latest edition's clock times are laid on the dates, and hacking must begin and end inside the weekend |
| `ci.yml has no preview-hacklytics<year> job to copy` | There is no archive in `ci.yml` to model the new one on. Add the previous edition's jobs by hand |
| `firebase.json has no hosting entry ... under sites/hacklytics<year>/` | The live entry does not serve the latest edition's directory. Fix `firebase.json` first |

## Known limits

- The service worker, `sw.js`, is copied. Only its first comment line is renamed.
- `scripts/subset-fonts.py` and the `vision` script are not copied. The fonts are, so a new edition can ship with the latest edition's faces without the tooling.
- The prompts cannot be driven by piped input, because the prompt library needs a terminal. Use `--args` in scripts.
