// tRPC procedures in packages/api, found by following how appRouter is built:
// root.ts names the routers, each router is createTRPCRouter({...}) or
// mergeRouters(...), and entries are either `name: procedure`, `name: router`
// or `...spread` of another object or router. Nothing is imported or run, so no
// database or environment is needed.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  findClose,
  lineAt,
  parseChain,
  readIfChanged,
  rel,
  ROOT,
  skipLiteral,
  splitTop,
  stripComments,
} from "./source.ts";

const ROOT_FILE = resolve(ROOT, "packages/api/src/root.ts");
const ROOT_EXPORT = "appRouter";

export interface Procedure {
  path: string;
  type: "query" | "mutation" | "subscription";
  /** The procedure the call starts from, then the procedures it is built on. */
  kind: string[];
  /** Middleware named in `.use(...)` on the procedure itself. */
  use: string[];
  file: string;
  line: number;
}

interface Source {
  file: string;
  text: string;
  mtime: number;
  size: number;
}

const sources = new Map<string, Source>();
let checked = new Set<string>();
const load = (file: string): Source => {
  // Keyed on mtime and size, so an edited router is read again. Each file is
  // checked once per procedures() run, not on every lookup.
  const prior = sources.get(file);
  if (prior && checked.has(file)) return prior;
  checked.add(file);
  const fresh = readIfChanged(file, prior);
  if (!fresh && prior) return prior;
  const source = {
    file,
    text: stripComments(fresh?.text ?? ""),
    mtime: fresh?.mtime ?? 0,
    size: fresh?.size ?? 0,
  };
  sources.set(file, source);
  return source;
};

const resolveImport = (from: string, spec: string): string | null => {
  const base = resolve(dirname(from), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
  ])
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  return null;
};

// Where a name imported into `source` is declared: [file, name there].
function importedFrom(source: Source, name: string): [string, string] | null {
  const pattern =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](\.[^"']*)["']/g;
  for (const match of source.text.matchAll(pattern)) {
    for (const part of match[1].split(",")) {
      const [original, alias] = part.trim().split(/\s+as\s+/);
      if ((alias ?? original) === name) {
        const target = resolveImport(source.file, match[2]);
        if (target) return [target, original];
      }
    }
  }
  return null;
}

interface Decl {
  file: string;
  /** Right-hand side of `const name = ...`, without the trailing semicolon. */
  expr: string;
  /** Offset of `expr` in its file, for line numbers. */
  offset: number;
}

// End of the statement whose expression starts at `start`: the first `;` or
// line break outside brackets, unless the line continues with `.` or ends in an
// operator.
function statementEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const skipped = skipLiteral(text, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const c = text[i];
    if ("([{".includes(c)) {
      const close = findClose(text, i);
      if (close === -1) return text.length;
      i = close + 1;
      continue;
    }
    if (c === ";") return i;
    if (c === "\n") {
      const next = text.slice(i + 1).trimStart();
      const soFar = text.slice(start, i).trimEnd();
      if (!next.startsWith(".") && !/[=,&|?:+\-<>]$/.test(soFar)) return i;
    }
    i++;
  }
  return text.length;
}

function findDecl(file: string, name: string, depth = 0): Decl | null {
  if (depth > 6) return null;
  const source = load(file);
  const pattern = new RegExp(
    `(?:^|\\n)[ \\t]*(?:export\\s+)?const\\s+${name.replaceAll("$", "\\$")}\\b(?:\\s*:[^=\\n]+)?\\s*=\\s*`,
  );
  const match = pattern.exec(source.text);
  if (match) {
    const start = match.index + match[0].length;
    const end = statementEnd(source.text, start);
    return { file, expr: source.text.slice(start, end).trim(), offset: start };
  }
  const imported = importedFrom(source, name);
  return imported ? findDecl(imported[0], imported[1], depth + 1) : null;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
const PROCEDURE_CALLS = new Set(["query", "mutation", "subscription"]);
const ROUTER_HEAD = /^(createTRPCRouter|mergeRouters|t\.router)$/;

// The procedures a head such as `judgeProcedure` is built on, outward.
function kindOf(head: string, file: string): string[] {
  const kinds = [head];
  let current = head;
  let at = file;
  for (let guard = 0; guard < 8 && IDENT.test(current); guard++) {
    const decl = findDecl(at, current);
    if (!decl) break;
    const next = parseChain(decl.expr).head;
    if (!IDENT.test(next)) break;
    kinds.push(next);
    current = next;
    at = decl.file;
  }
  return kinds;
}

function useNames(calls: { name: string; args: string }[]): string[] {
  return calls
    .filter((call) => call.name === "use")
    .map(
      (call) =>
        /^\s*([A-Za-z_$][\w$.]*)\s*(?:\)|$|,)/.exec(call.args)?.[1] ?? "inline",
    );
}

interface Scope {
  file: string;
  /** Offset in `file` of the text being read. */
  offset: number;
}

const NAMED_ENTRY =
  /^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]*)$/;

function readObject(
  body: string,
  at: Scope,
  prefix: string,
  out: Procedure[],
  seen: Set<string>,
) {
  for (const piece of splitTop(body)) {
    const spread = /^\.\.\.\s*([A-Za-z_$][\w$]*)$/.exec(piece.text);
    if (spread) {
      readRef(spread[1], at.file, prefix, out, seen);
      continue;
    }
    const named = NAMED_ENTRY.exec(piece.text);
    if (!named) {
      if (IDENT.test(piece.text))
        readRef(piece.text, at.file, `${prefix}${piece.text}.`, out, seen);
      continue;
    }
    const name = named[1] ?? named[2] ?? named[3];
    const value = named[4].trim();
    const offset = at.offset + piece.start;
    if (IDENT.test(value)) {
      readRef(value, at.file, `${prefix}${name}.`, out, seen);
      continue;
    }
    const chain = parseChain(value);
    const call = chain.calls.findLast((c) => PROCEDURE_CALLS.has(c.name));
    if (call && !ROUTER_HEAD.test(chain.head)) {
      out.push({
        path: `${prefix}${name}`,
        type: call.name as Procedure["type"],
        kind: kindOf(chain.head, at.file),
        use: useNames(chain.calls),
        file: rel(at.file),
        line: lineAt(load(at.file).text, offset),
      });
    } else {
      readExpr(
        value,
        { file: at.file, offset },
        `${prefix}${name}.`,
        out,
        seen,
      );
    }
  }
}

function readExpr(
  expr: string,
  at: Scope,
  prefix: string,
  out: Procedure[],
  seen: Set<string>,
) {
  const trimmed = expr.trim();
  if (trimmed.startsWith("{")) {
    const close = findClose(trimmed, 0);
    readObject(
      trimmed.slice(1, close),
      { file: at.file, offset: at.offset + 1 },
      prefix,
      out,
      seen,
    );
    return;
  }
  const call = /^(createTRPCRouter|t\.router|mergeRouters)\s*\(/.exec(trimmed);
  if (call) {
    const open = call[0].length - 1;
    const args = trimmed.slice(open + 1, findClose(trimmed, open));
    for (const arg of splitTop(args))
      readExpr(
        arg.text,
        { file: at.file, offset: at.offset + open + 1 + arg.start },
        prefix,
        out,
        seen,
      );
    return;
  }
  if (IDENT.test(trimmed)) readRef(trimmed, at.file, prefix, out, seen);
}

function readRef(
  name: string,
  file: string,
  prefix: string,
  out: Procedure[],
  seen: Set<string>,
) {
  const decl = findDecl(file, name);
  if (!decl) return;
  const id = `${decl.file}#${name}#${prefix}`;
  if (seen.has(id)) return;
  seen.add(id);
  readExpr(
    decl.expr,
    { file: decl.file, offset: decl.offset },
    prefix,
    out,
    seen,
  );
}

/** Every procedure reachable from appRouter, in router order. */
export function procedures(rootFile = ROOT_FILE): Procedure[] {
  const out: Procedure[] = [];
  checked = new Set();
  readRef(ROOT_EXPORT, rootFile, "", out, new Set());
  return out;
}

export function formatProcedure(p: Procedure): string {
  const use = p.use.length ? `  +use(${p.use.join(", ")})` : "";
  return `${p.path}  ${p.type}  ${p.kind.join(" > ")}${use}  ${p.file}:${p.line}`;
}

export function apiProcedures(router?: string): string {
  const all = procedures();
  if (!all.length)
    throw new Error(
      `No procedures found from ${ROOT_EXPORT} in ${rel(ROOT_FILE)}`,
    );
  const wanted = router?.trim().replace(/\.$/, "");
  const picked = wanted
    ? all.filter((p) => p.path === wanted || p.path.startsWith(`${wanted}.`))
    : all;
  if (!picked.length) {
    const tops = [...new Set(all.map((p) => p.path.split(".")[0]))];
    throw new Error(
      `No procedures under "${router}". Top-level routers: ${tops.join(", ")}`,
    );
  }
  const depth = wanted ? wanted.split(".").length + 1 : 1;
  const counts = new Map<string, number>();
  for (const p of picked) {
    const group = p.path.split(".").slice(0, depth).join(".");
    // A procedure sitting directly under the router is not a sub-router.
    if (group === p.path) continue;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const groups = [...counts].map(([g, n]) => `${g} ${n}`).join(", ");
  const header = `${picked.length} procedures${groups ? ` (${groups})` : ""}`;
  return [header, ...picked.map(formatProcedure)].join("\n");
}
