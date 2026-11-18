/**
 * The theme CSS of a new edition: either the token blocks of the latest
 * edition's theme, or a neutral starter drawn from a palette table. The kit's
 * theme contract (docs/sites/event-kit.md) is the set of custom properties
 * below, defined once for night and once for day.
 */

interface CssItem {
  kind: "comment" | "statement" | "block";
  text: string;
  /** What comes before the `{` of a block, or the whole of a statement. */
  prelude: string;
}

/** Splits a stylesheet into its top-level comments, statements and blocks. */
export function splitTopLevel(css: string): CssItem[] {
  const items: CssItem[] = [];
  let i = 0;
  while (i < css.length) {
    if (/\s/.test(css[i])) {
      i++;
      continue;
    }
    const start = i;
    if (css.startsWith("/*", i)) {
      i = css.indexOf("*/", i) + 2;
      items.push({ kind: "comment", text: css.slice(start, i), prelude: "" });
      continue;
    }
    let depth = 0;
    let quote = "";
    let prelude = "";
    for (; i < css.length; i++) {
      const char = css[i];
      if (quote) {
        if (char === "\\") i++;
        else if (char === quote) quote = "";
      } else if (css.startsWith("/*", i)) {
        i = css.indexOf("*/", i) + 1;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === "{") {
        if (depth === 0) prelude = css.slice(start, i).trim();
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      } else if (char === ";" && depth === 0) {
        prelude = css.slice(start, i).trim();
        i++;
        break;
      }
    }
    const text = css.slice(start, i).trim();
    items.push({
      kind: text.endsWith("}") ? "block" : "statement",
      text,
      prelude: prelude || text,
    });
  }
  return items;
}

/** The rules a theme is made of. Anything else in a site's CSS is that edition's art. */
const THEME_PRELUDE =
  /^(@import\b|@theme\b|:root|@media \(prefers-color-scheme)/;

/**
 * The theme contract out of an existing site's stylesheet: the imports, the
 * `@theme` that names the fonts, and the custom properties for night and day,
 * each with the comment written above it. The art's rules are left behind.
 * The stylesheet's first comment describes the art, so it is dropped as well.
 */
export function extractTheme(css: string): string {
  const items = splitTopLevel(css);
  if (items[0]?.kind === "comment") items.shift();
  const kept: { text: string; statement: boolean }[] = [];
  let pending: string[] = [];
  for (const item of items) {
    if (item.kind === "comment") {
      pending.push(item.text);
    } else {
      if (THEME_PRELUDE.test(item.prelude)) {
        kept.push({
          text: [...pending, item.text].join("\n"),
          statement: item.kind === "statement" && pending.length === 0,
        });
      }
      pending = [];
    }
  }
  // Imports stay on adjacent lines, as written; everything else gets a blank line.
  return kept.reduce(
    (css, group, index) =>
      index === 0
        ? group.text
        : `${css}${group.statement && kept[index - 1].statement ? "\n" : "\n\n"}${group.text}`,
    "",
  );
}

/** A custom property's value out of CSS text, or undefined. */
export function declaredValue(
  css: string,
  property: string,
): string | undefined {
  const escaped = property.replace(/[-]/g, "\\-");
  return new RegExp(`${escaped}\\s*:\\s*([^;]+);`).exec(css)?.[1].trim();
}

/** A theme's custom properties for one color scheme, by property name. */
type Palette = Record<string, string>;

/**
 * The neutral starter's colors, once per scheme. Every text and UI pair here
 * clears WCAG AA on its ground. A token the kit requires that is in neither
 * palette is not a color, and is read from the latest edition's theme.
 */
export const NEUTRAL: { dark: Palette; light: Palette } = {
  dark: {
    "--ground": "#121417",
    "--raised": "#1a1d21",
    "--ink": "#f2f3f5",
    "--ink-2": "#b9bec6",
    "--ink-3": "#959ba5",
    "--rule": "#2a2e34",
    "--bloom": "#7cc0ff",
    "--bloom-hover": "#a3d3ff",
    "--bloom-deep": "#1f5f99",
    "--on-bloom": "#06121f",
    "--on-bloom-deep": "#ffffff",
    "--sage": "#8cc9a0",
    "--logo-tile": "#ffffff",
    "--line-border": "#5d646f",
    "--badge-edge": "transparent",
  },
  light: {
    "--ground": "#f4f5f7",
    "--raised": "#ffffff",
    "--ink": "#14161a",
    "--ink-2": "#454b55",
    "--ink-3": "#5e6570",
    "--rule": "#dcdfe4",
    "--bloom": "#1b5fa8",
    "--bloom-hover": "#164f8d",
    "--bloom-deep": "#0f3d70",
    "--on-bloom": "#ffffff",
    "--on-bloom-deep": "#ffffff",
    "--sage": "#2f7a4a",
    "--logo-tile": "#ffffff",
    "--line-border": "#7d8590",
    "--badge-edge": "#dcdfe4",
  },
};

const FALLBACK_FONTS = "ui-sans-serif, system-ui, sans-serif";

/**
 * The neutral starter: system fonts, one accent, no art. `required` is every
 * custom property the kit's stylesheet says a theme defines, and `inherited`
 * gives the value of one that is not a color, from the latest edition.
 */
export function neutralTheme(
  required: readonly string[],
  inherited: (token: string) => string | undefined,
): string {
  const shared = required.filter(
    (token) => !(token in NEUTRAL.dark) && !(token in NEUTRAL.light),
  );
  const lines = (
    tokens: readonly string[],
    values: (token: string) => string | undefined,
    indent: string,
  ) =>
    tokens
      .map((token) => {
        const value = values(token);
        if (value === undefined) {
          throw new Error(
            `The kit's theme needs ${token}. Add it to NEUTRAL in turbo/generators/hacklytics/theme.ts, or set it in the latest edition's theme.`,
          );
        }
        return `${indent}${token}: ${value};`;
      })
      .join("\n");
  const scheme = (palette: Palette, indent: string) =>
    lines(
      required.filter((token) => !shared.includes(token)),
      (token) => palette[token],
      indent,
    );
  const sharedLines = shared.length
    ? `\n\n${lines(shared, inherited, "  ")}`
    : "";
  return `@import "tailwindcss";
@import "@query/event-kit/styles.css";

/* The two type families the kit's components use. TODO: name your fonts here
   and load them with @font-face and a preload in layouts/Layout.astro. */
@theme inline {
  --font-display: ${FALLBACK_FONTS};
  --font-sans: ${FALLBACK_FONTS};
}

/* The kit sets display type for a pixel face, tight to its grid. System fonts
   want ordinary spacing and a heavier weight. Delete this when you load a
   face that is drawn to be set tight. */
.font-display,
.display,
.section-title {
  letter-spacing: normal;
  font-weight: 700;
}
.section-title {
  margin-left: 0;
}

/* Night. TODO: choose your palette. --ground must equal theme.ground.dark in
   src/event.config.ts. */
:root {
${scheme(NEUTRAL.dark, "  ")}${sharedLines}
  color-scheme: dark;
}

/* Day. Used when the visitor picks light, or has no choice saved and their
   system is light. --ground must equal theme.ground.light. */
:root[data-theme="light"] {
${scheme(NEUTRAL.light, "  ")}

  color-scheme: light;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
${scheme(NEUTRAL.light, "    ")}

    color-scheme: light;
  }
}`;
}
