/**
 * Writing carried values back as source. The latest edition's config is read
 * at run time, where `venue.timeZone: VENUE_TZ` is only the string it holds.
 * Carrying that string over would copy the constant's current value into the
 * new site. Instead, a value the config got from a package it imports is
 * written as the imported name again, so the new site follows the package.
 */

/** A named import of the latest edition's config, with the value it holds. */
export interface Imported {
  from: string;
  imported: string;
  local: string;
  value: unknown;
}

/** The named imports of a module's source, as `[from, imported, local]`. Type imports are left out. */
export function parseNamedImports(
  source: string,
): { from: string; imported: string; local: string }[] {
  const found: { from: string; imported: string; local: string }[] = [];
  for (const match of source.matchAll(
    /^import\s+(?!type\b)\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm,
  )) {
    for (const specifier of match[1].split(",")) {
      const [imported, , local = imported] = specifier.trim().split(/\s+/);
      if (imported && imported !== "type")
        found.push({ from: match[2], imported, local });
    }
  }
  return found;
}

/** What a string value stands for in source: the import it came from, and the expression that reads it. */
export interface Reference {
  expression: string;
  binding: Imported;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Every string an imported constant holds, keyed by the string. An object is
 * searched for its string properties, so `SOCIAL_LINKS.instagram` is found.
 * When two constants hold the same string, the first import wins.
 */
export function referencesOf(imports: readonly Imported[]) {
  const references = new Map<string, Reference>();
  const visit = (value: unknown, expression: string, binding: Imported) => {
    if (typeof value === "string") {
      if (value && !references.has(value))
        references.set(value, { expression, binding });
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, inner] of Object.entries(value)) {
        if (IDENTIFIER.test(key)) visit(inner, `${expression}.${key}`, binding);
      }
    }
  };
  for (const binding of imports) visit(binding.value, binding.local, binding);
  return references;
}

/** `value` as an object or array literal, with each string an import holds written as that import. */
export function sourceOf(
  value: unknown,
  references: ReadonlyMap<string, Reference>,
  used: Set<Imported>,
  indent = "",
): string {
  if (typeof value === "string") {
    const reference = references.get(value);
    if (reference) {
      used.add(reference.binding);
      return reference.expression;
    }
    return JSON.stringify(value);
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const inner = `${indent}  `;
  const items = Array.isArray(value)
    ? value.map((item) => sourceOf(item, references, used, inner))
    : Object.entries(value).map(
        ([key, item]) =>
          `${JSON.stringify(key)}: ${sourceOf(item, references, used, inner)}`,
      );
  const [open, close] = Array.isArray(value) ? "[]" : "{}";
  if (items.length === 0) return `${open}${close}`;
  return `${open}\n${items.map((item) => `${inner}${item}`).join(",\n")}\n${indent}${close}`;
}

/** The properties of `value` as source, without the braces around them. */
export function propertiesOf(
  value: Record<string, unknown>,
  references: ReadonlyMap<string, Reference>,
  used: Set<Imported>,
): string {
  const text = sourceOf(value, references, used);
  return text.slice(text.indexOf("\n") + 1, text.lastIndexOf("\n"));
}

/** One `import { ... } from` line per package, for the imports in `used`. */
export function importLines(used: ReadonlySet<Imported>): string {
  const byPackage = new Map<string, string[]>();
  for (const { from, imported, local } of used) {
    const specifier = imported === local ? local : `${imported} as ${local}`;
    byPackage.set(from, [...(byPackage.get(from) ?? []), specifier]);
  }
  return [...byPackage]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([from, specifiers]) =>
        `import { ${[...new Set(specifiers)].sort().join(", ")} } from ${JSON.stringify(from)};`,
    )
    .join("\n");
}
