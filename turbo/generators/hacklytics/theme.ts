/**
 * The theme CSS of a new edition: the token blocks of the latest edition's
 * theme. The kit's theme contract (docs/sites/event-kit.md) is the set of
 * custom properties those blocks define, once for night and once for day, so
 * a new edition starts with every one the kit asks for.
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
