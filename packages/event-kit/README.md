# `@query/event-kit`

The page shell, navbar, footer, content sections and structural CSS that every Hacklytics event site shares. An edition supplies one config, one theme and its own art.

In the [query](https://github.com/DataScience-GT/query) monorepo this package is `@query/event-kit`. It is published to GitHub Packages as `@datascience-gt/event-kit`. See [publishing](https://github.com/DataScience-GT/query/blob/main/docs/packages/publishing.md) for how to install it from there.

It ships source, not a build. The components are `.astro` and `.tsx` files and the styles are Tailwind CSS 4, so the consuming Astro site compiles them.

## Peer dependencies

Your site provides these. The kit does not install them.

| Package | Range |
| --- | --- |
| `astro` | `^7.4.7` |
| `react` | `^18.3.1 \|\| ^19.0.0` |
| `react-dom` | `^18.3.1 \|\| ^19.0.0` |
| `tailwindcss` | `^4.3.3` |

The site also needs Astro's React integration (`@astrojs/react`) for the `.tsx` sections and Tailwind's Vite plugin (`@tailwindcss/vite`).

## Entries

| Import | What |
| --- | --- |
| `@datascience-gt/event-kit` | `defineEvent` and the config types |
| `@datascience-gt/event-kit/components/<File>` | `Layout.astro`, `HomeSections.astro`, `Navbar.astro`, `Footer.astro`, `MlhBadge.astro` and the section components |
| `@datascience-gt/event-kit/styles.css` | Structural CSS and the Tailwind color tokens. Import it after Tailwind |

```css
@import "tailwindcss";
@import "@datascience-gt/event-kit/styles.css";
```

The site defines the palette custom properties and the two font families the components read. The full contract, the `EventConfig` fields and how an edition is set up are in the [event kit docs](https://github.com/DataScience-GT/query/blob/main/docs/sites/event-kit.md).

## License

Apache License 2.0. See [LICENSE](./LICENSE).
