// Shared by every tool: the repo root, safe file reads and a small scanner for
// TypeScript source. The scanner is not a parser. It knows strings, template
// literals and comments well enough to match brackets and split on commas, which
// is all the route, router and schema readers need.
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export const read = (file: string) => readFileSync(file, "utf8");

interface Stamp {
  mtime: number;
  size: number;
}

/**
 * Reads a file through one descriptor, so the mtime and size returned are those
 * of the bytes read: a file edited between a stat and a read would otherwise be
 * cached under a stamp that does not match its text. Returns null when the file
 * still has the stamp of `prior`.
 */
export function readIfChanged(
  file: string,
  prior?: Stamp,
): (Stamp & { text: string }) | null {
  const fd = openSync(file, "r");
  try {
    const stat = fstatSync(fd);
    if (prior && prior.mtime === stat.mtimeMs && prior.size === stat.size)
      return null;
    return {
      text: readFileSync(fd, "utf8"),
      mtime: stat.mtimeMs,
      size: stat.size,
    };
  } finally {
    closeSync(fd);
  }
}

/** Repo-relative path with forward slashes, the form every tool reports. */
export const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");

/** Recursive file list, skipping dependency, build and VCS folders. */
export function walk(dir: string, keep: (file: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      if (
        name === "node_modules" ||
        name === ".next" ||
        name === ".git" ||
        name === ".turbo" ||
        name === ".claude"
      )
        continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (keep(full)) out.push(full);
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

/** 1-based line of a character offset. */
export const lineAt = (text: string, offset: number) => {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
};

// A `/` starts a regex literal, not a division, after an operator or opening
// bracket. A heuristic, and enough for this repo's source.
function regexAllowedBefore(text: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
  if (j < 0 || text[j] === "\n") return true;
  if ("(,=:[!&|?{};+-*%<>~^".includes(text[j])) return true;
  return /(?:^|[^\w$.])(?:return|typeof|case|in|of)$/.test(
    text.slice(Math.max(0, j - 7), j + 1),
  );
}

// Index just past the string, template or comment starting at `i`, or `i`
// itself when none starts there.
export function skipLiteral(text: string, i: number): number {
  const c = text[i];
  if (c === "/" && text[i + 1] === "/") {
    const end = text.indexOf("\n", i);
    return end === -1 ? text.length : end;
  }
  if (c === "/" && text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (c === "/" && regexAllowedBefore(text, i)) {
    let inClass = false;
    for (let j = i + 1; j < text.length && text[j] !== "\n"; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === "[") inClass = true;
      else if (text[j] === "]") inClass = false;
      else if (text[j] === "/" && !inClass) {
        while (/[a-z]/.test(text[j + 1] ?? "")) j++;
        return j + 1;
      }
    }
    return i;
  }
  if (c === '"' || c === "'") {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === c) return j + 1;
    }
    return text.length;
  }
  if (c === "`") {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === "`") return j + 1;
      else if (text[j] === "$" && text[j + 1] === "{") {
        j = findClose(text, j + 1);
        if (j === -1) return text.length;
      }
    }
    return text.length;
  }
  return i;
}

const OPEN = "([{";
const CLOSE = ")]}";

/** Index of the bracket closing the one at `open`, or -1. */
export function findClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const skipped = skipLiteral(text, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }
    if (OPEN.includes(text[i])) depth++;
    else if (CLOSE.includes(text[i]) && --depth === 0) return i;
  }
  return -1;
}

interface Piece {
  text: string;
  /** Offset of the piece in the string that was split. */
  start: number;
}

/** Splits on commas that sit at bracket depth 0. Empty pieces are dropped. */
export function splitTop(text: string): Piece[] {
  const pieces: Piece[] = [];
  let depth = 0;
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed)
      pieces.push({ text: trimmed, start: start + raw.indexOf(trimmed) });
  };
  for (let i = 0; i < text.length; i++) {
    const skipped = skipLiteral(text, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }
    if (OPEN.includes(text[i])) depth++;
    else if (CLOSE.includes(text[i])) depth--;
    else if (text[i] === "," && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(text.length);
  return pieces;
}

/** Blanks comments so a pattern cannot match inside one; offsets are kept. */
export function stripComments(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const skipped = skipLiteral(text, i);
    const isComment =
      text[i] === "/" && (text[i + 1] === "/" || text[i + 1] === "*");
    if (skipped !== i) {
      const chunk = text.slice(i, skipped);
      out += isComment ? chunk.replace(/[^\n]/g, " ") : chunk;
      i = skipped - 1;
    } else out += text[i];
  }
  return out;
}

/**
 * Walks a chain such as `a.b(x).c(y)` and returns each `.name(args)` call at
 * depth 0. The head (text before the first call) comes back as `head`.
 */
export function parseChain(expr: string): {
  head: string;
  calls: { name: string; args: string }[];
} {
  const calls: { name: string; args: string }[] = [];
  let i = 0;
  let headEnd = -1;
  while (i < expr.length) {
    const skipped = skipLiteral(expr, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (OPEN.includes(expr[i])) {
      const close = findClose(expr, i);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    const call = /^\.\s*([A-Za-z_$][\w$]*)\s*(?:<[^()]*>)?\s*\(/.exec(
      expr.slice(i),
    );
    if (call) {
      if (headEnd === -1) headEnd = i;
      const open = i + call[0].length - 1;
      const close = findClose(expr, open);
      if (close === -1) break;
      calls.push({ name: call[1], args: expr.slice(open + 1, close) });
      i = close + 1;
      continue;
    }
    i++;
  }
  return {
    head: (headEnd === -1 ? expr : expr.slice(0, headEnd)).trim(),
    calls,
  };
}
