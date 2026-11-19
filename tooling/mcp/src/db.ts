// Drizzle tables declared in packages/db/src/schemas, read from the source:
// every `export const x = pgTable("name", { columns }, (t) => [indexes])`.
import { resolve } from "node:path";

import {
  findClose,
  lineAt,
  parseChain,
  read,
  rel,
  ROOT,
  splitTop,
  stripComments,
  walk,
} from "./source.ts";

const SCHEMAS = resolve(ROOT, "packages/db/src/schemas");

export interface Column {
  key: string;
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default: string | null;
  references: string | null;
  array: boolean;
  line: number;
}

export interface Table {
  variable: string;
  name: string;
  file: string;
  line: number;
  columns: Column[];
  /** Names of indexes, unique indexes, unique and check constraints. */
  constraints: string[];
}

const compact = (text: string) => text.replace(/\s+/g, " ").trim();

function parseColumn(entry: string, line: number): Column | null {
  const named = /^(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]+)$/.exec(
    entry,
  );
  if (!named) return null;
  const key = named[1] ?? named[2];
  const chain = parseChain(named[3]);
  const base = /^([A-Za-z_$][\w$]*)\s*\(/.exec(chain.head);
  if (!base) return null;
  const open = chain.head.indexOf("(");
  const args = splitTop(
    chain.head.slice(open + 1, findClose(chain.head, open)),
  );
  const dbName = /^["'`]([^"'`]+)["'`]$/.exec(args[0]?.text ?? "")?.[1] ?? key;
  const options = args.slice(args[0] && /^["'`]/.test(args[0].text) ? 1 : 0)[0]
    ?.text;
  let type = base[1];
  if (options) {
    const flat = compact(options).replace(/,\s*}/, " }");
    if (flat.length <= 70) type += ` ${flat}`;
  }
  const has = (name: string) => chain.calls.some((call) => call.name === name);
  const defaults = chain.calls
    .filter((call) =>
      /^(default|\$default|\$defaultFn|defaultNow|defaultRandom)/.test(
        call.name,
      ),
    )
    .map((call) => `${call.name}(${compact(call.args)})`);
  const ref = chain.calls.find((call) => call.name === "references");
  return {
    key,
    name: dbName,
    type,
    nullable: !has("notNull") && !has("primaryKey"),
    primaryKey: has("primaryKey"),
    unique: has("unique"),
    default: defaults.length ? defaults.join(" ") : null,
    references: ref
      ? (/=>\s*([\w$.]+)/.exec(ref.args)?.[1] ?? compact(ref.args))
      : null,
    array: has("array"),
    line,
  };
}

export function tables(): Table[] {
  const found: Table[] = [];
  for (const file of walk(SCHEMAS, (f) => f.endsWith(".ts"))) {
    const text = stripComments(read(file));
    const pattern =
      /(?:^|\n)[ \t]*export\s+const\s+([\w$]+)\s*=\s*pgTable\s*\(/g;
    for (const match of text.matchAll(pattern)) {
      const open = match.index + match[0].length - 1;
      const close = findClose(text, open);
      const args = splitTop(text.slice(open + 1, close));
      const sqlName = /^["'`]([^"'`]+)["'`]$/.exec(args[0]?.text ?? "")?.[1];
      if (!sqlName || !args[1]?.text.startsWith("{")) continue;
      const bodyStart = open + 1 + args[1].start + 1;
      const body = args[1].text.slice(1, findClose(args[1].text, 0));
      const columns: Column[] = [];
      for (const piece of splitTop(body)) {
        const column = parseColumn(
          piece.text,
          lineAt(text, bodyStart + piece.start),
        );
        if (column) columns.push(column);
      }
      const constraints: string[] = [];
      for (const named of (args[2]?.text ?? "").matchAll(
        /\b(index|uniqueIndex|unique|check|primaryKey|foreignKey)\s*\(\s*["'`]([^"'`]+)["'`]/g,
      ))
        constraints.push(`${named[1]} ${named[2]}`);
      found.push({
        variable: match[1],
        name: sqlName,
        file: rel(file),
        line: lineAt(text, match.index + match[0].indexOf("export")),
        columns,
        constraints,
      });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function formatColumn(c: Column): string {
  const bits = [
    c.name === c.key ? c.key : `${c.key} (${c.name})`,
    c.type + (c.array ? "[]" : ""),
    c.primaryKey ? "pk" : c.nullable ? "null" : "not null",
    c.unique ? "unique" : "",
    c.default ?? "",
    c.references ? `-> ${c.references}` : "",
  ];
  return `  ${bits.filter(Boolean).join("  ")}  :${c.line}`;
}

export function dbSchema(table?: string): string {
  const all = tables();
  if (!all.length)
    throw new Error(`No pgTable declarations found under ${rel(SCHEMAS)}`);
  if (!table?.trim()) {
    return [
      `${all.length} tables`,
      ...all.map(
        (t) =>
          `${t.variable} (${t.name})  ${t.columns.length} columns  ${t.file}:${t.line}`,
      ),
    ].join("\n");
  }
  const wanted = table.trim().toLowerCase();
  const hit = all.filter(
    (t) =>
      t.variable.toLowerCase() === wanted || t.name.toLowerCase() === wanted,
  );
  if (!hit.length) {
    const near = all
      .filter(
        (t) =>
          t.variable.toLowerCase().includes(wanted) || t.name.includes(wanted),
      )
      .map((t) => t.variable);
    throw new Error(
      `No table "${table}".${near.length ? ` Did you mean: ${near.join(", ")}?` : " Call db_schema with no argument to list them."}`,
    );
  }
  return hit
    .map((t) =>
      [
        `${t.variable} (${t.name})  ${t.file}:${t.line}`,
        ...t.columns.map(formatColumn),
        t.constraints.length
          ? `  constraints: ${t.constraints.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}
