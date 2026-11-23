# Starting a new Hacklytics edition

One command makes a working `sites/hacklytics<year>` on the [event kit](./event-kit.md) and wires its deploy. You then edit the content and the theme.

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

A bad answer is refused before any file is touched. `turbo gen` prints the refusal and still exits with code 0, so read its output.

### Without the prompts

`--args` takes the answers in prompt order. Use it in scripts and when an agent runs the command.

```bash
pnpm turbo gen hacklytics --args 2028 "Digital Bloom" 2028-02-25 2028-02-27
```

## What it reads, so you do not retype it

The generator holds no brand, venue, link, contact, organizer, time zone, price, clock time or Firebase target of its own. The latest edition is the source of each one. It loads that edition's `src/event.config.ts` through the kit and carries every field over, so a field the kit adds to the config later is carried over too.

| What the new edition gets | Where it comes from |
| --- | --- |
| `brand`, `timeZone`, `venue`, `organizer`, `contactEmail`, `links` (portal origin and path, local portal, MLH, code of conduct, social), `registration` (sign-up URL, label, availability, price, currency), `theme.storageKey`, `theme.ground`, and any other core field the answers do not decide | The latest edition's config, as it is |
| A value the latest config reads from a package it imports, today `@query/core` (the portal origin, social links, time zone, code of conduct URL and organization name) | The same import. The new config imports the same names from the same package, and the new `package.json` depends on it because the latest edition's does. The constant is never copied as a string |
| `seo.tagline`, `keywords`, `url`, `image`, `twitter` | The latest edition's config, as they are. The four description fields are new `TODO` copy |
| The clock times | Read as a pattern from `start`, `end` and `hacking`: the clock time of each, and the day each falls on relative to the start or end date. The pattern is laid on your dates, in the config's time zone |
| `registration.validFrom` | The same month, day and time, moved by the number of years between the editions |
| The files a site must serve from `public/` | Read from the quoted root paths in the kit's components, so a file the kit starts to link is picked up |
| `package.json` | The latest edition's, with the name changed and the `vision` script and `playwright` dropped, since the capture script is not copied |
| `src/styles/globals.css`, the fonts, `turbo.json` | The latest edition's. `globals.css` keeps the imports, the `@theme` that names the fonts and the custom properties for night and day, without the edition's art |
| The Firebase live target, the site directories, the artifact names, the CI job names | The existing entries in `firebase.json`, `.firebaserc` and `ci.yml`, and the year. See [What it changes outside the site](#what-it-changes-outside-the-site) |

The ISO strings get the offset the zone has on that date. A weekend in late March is `-04:00` and one in February is `-05:00`. A clock time the zone skips is refused.

Check `registration.url`, `registration.validFrom` and `links.mlh` before launch. They belong to one season, and they are copied as they were. The header of the generated `event.config.ts` lists everything that was carried over.

Only content that is new for an edition is a placeholder. Every line of it is a `TODO` in `event.config.ts`, written to satisfy the kit's non-empty lists, so the site builds and renders before you touch them.

## What it makes

```
sites/hacklytics<year>/
  package.json            name changed; dependencies as the latest edition has them
  astro.config.mjs  tsconfig.json  turbo.json  oxlint.config.mts  .gitignore  README.md
  src/event.config.ts     the dates and theme you gave, carried fields, TODO copy
  src/layouts/Layout.astro  src/pages/index.astro  src/pages/404.astro
  src/styles/globals.css  the theme
  src/styles/fonts.generated.css  src/lib/fonts.generated.ts  public/fonts/
  public/                 favicon.ico, apple-icon.png, mlh-trust-badge.svg, sw.js, the share image
```

The page is the kit's. `index.astro` has a plain placeholder hero and then `HomeSections`. `404.astro` is a plain 404. Art is optional, so none is made. The schedule board starts with four rows (check-in opens, hacking begins, hacking ends, closing ceremony). Their times come from the pattern, and their weekdays follow the dates.

## What it changes outside the site

The Firebase target `hacklytics` serves the latest edition. Each older edition keeps a target of its own, named after the live target and its year. Making a new edition live turns the previous one into an archive.

| File | Change |
| --- | --- |
| `firebase.json` | The live entry's `public` moves to the new site's `out/`. The previous edition gets an entry of its own, a copy of the live entry as it stood, with target `hacklytics<previous year>`. It goes right after the live entry |
| `.firebaserc` | The new archive target maps to the Hosting site id `hacklytics<previous year>-archive`, next to the live target |
| `.github/workflows/ci.yml` | `verify` uploads the new site's `out/` as the live artifact. The live jobs download the new site. Archives are frozen, so `ci.yml` has no archive jobs and the previous edition gets none. If `ci.yml` does hold `preview-hacklytics<year>` and `deploy-hacklytics<year>` jobs, the previous edition gets a copy of the newest pair and an upload step |
| `pnpm-lock.yaml` | `pnpm install` adds the new workspace |

The live target's name, the artifact names and the job names are read from the files, not typed. The live Hosting site keeps its id, so the custom domain stays where it is.

Each edit finds what it needs in the file (the live target, the site directories, the newest archive's jobs) and does nothing when its edit is already there. If a run stops partway, run it again.

Commit the lockfile with the site. CI installs with `--frozen-lockfile`.

## The one step that is yours

Create the Firebase Hosting site for the archive target. The generator prints it:

1. In the Firebase console, open the project the generator names, then Hosting, then Add another site.
2. Use the site id the generator printed, `hacklytics<previous year>-archive`. Or put the id of a site that exists into `.firebaserc` under `hacklytics<previous year>`.

CI does not deploy archives. Give the archive its one release by hand, before the new edition goes live on `main`:

```bash
pnpm turbo run build --filter=hacklytics<previous year>
firebase deploy --only hosting:hacklytics<previous year>
```

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
| `firebase.json has no hosting entry ... under sites/hacklytics<year>/` | The live entry does not serve the latest edition's directory. Fix `firebase.json` first |

## Known limits

- The theme always starts as a copy of the latest edition's. Choose a new palette in `globals.css`. If the new edition drops a font, delete its files from `public/fonts/` and the matching rules from `fonts.generated.css`.
- Only named imports from packages are kept as imports. A value that arrives through `import * as`, a default import or a relative import is copied as the string it holds.
- The service worker, `sw.js`, is copied. Only its first comment line is renamed.
- `scripts/subset-fonts.py` and the `vision` script are not copied. The fonts are, so a new edition can ship with the latest edition's faces without the tooling.
- The prompts cannot be driven by piped input, because the prompt library needs a terminal. Use `--args` in scripts.
