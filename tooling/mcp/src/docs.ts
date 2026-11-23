// Documentation search and read over the files a contributor would open:
// docs/**, the root README, .github/CONTRIBUTING, and every package README.
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { read, rel, ROOT, walk } from "./source.ts";

const MAX_READ = 60_000;

export function docFiles(): string[] {
  const files = new Set<string>();
  for (const name of ["README.md", ".github/CONTRIBUTING.md"]) {
    if (existsSync(resolve(ROOT, name))) files.add(name);
  }
  for (const file of walk(resolve(ROOT, "docs"), (f) => f.endsWith(".md")))
    files.add(rel(file));
  for (const top of ["sites", "packages", "tooling"])
    for (const file of walk(resolve(ROOT, top), (f) =>
      /(?:^|[\\/])README\.md$/.test(f),
    ))
      files.add(rel(file));
  return [...files].sort();
}

export function docsSearch(query: string, limit = 8): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) throw new Error("Empty query");
  const files = docFiles().map((file) => ({
    file,
    lines: read(resolve(ROOT, file)).split(/\r?\n/),
  }));
  // A term in most files ("main", "dev") says little, so each term is weighted
  // by how rare it is across the docs.
  const weight = new Map(
    terms.map((term) => {
      const df = files.filter(({ lines }) =>
        lines.some((line) => line.toLowerCase().includes(term)),
      ).length;
      return [term, Math.log(1 + files.length / Math.max(df, 1))];
    }),
  );
  const scored = files.map(({ file, lines }) => {
    const matches: { line: number; text: string; hits: number }[] = [];
    let score = 0;
    lines.forEach((text, index) => {
      const lower = text.toLowerCase();
      const found = terms.filter((term) => lower.includes(term));
      if (found.length) {
        const value = found.reduce(
          (sum, term) => sum + (weight.get(term) ?? 0),
          0,
        );
        matches.push({
          line: index + 1,
          text: text.trim(),
          hits: value * found.length,
        });
        score += value * found.length;
      }
    });
    // A hit in the path outweighs body text.
    for (const term of terms)
      if (file.toLowerCase().includes(term))
        score += 5 * (weight.get(term) ?? 0);
    return { file, score, matches };
  });
  const top = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, limit);
  if (!top.length) return `No documentation matches "${query}".`;
  return top
    .map(({ file, matches }) => {
      const best = [...matches].sort((a, b) => b.hits - a.hits).slice(0, 3);
      best.sort((a, b) => a.line - b.line);
      return [
        file,
        ...best.map((m) => `  ${file}:${m.line}  ${m.text.slice(0, 160)}`),
      ].join("\n");
    })
    .join("\n\n");
}

/** Resolves `path` to an indexed doc, or throws. Never leaves the repo. */
export function resolveDoc(path: string): string {
  const full = resolve(ROOT, path);
  const inside = (candidate: string, base = ROOT) => {
    const diff = relative(base, candidate);
    return diff !== "" && !diff.startsWith("..") && !isAbsolute(diff);
  };
  if (!inside(full)) throw new Error(`Path is outside the repository: ${path}`);
  if (!existsSync(full)) throw new Error(`No such doc: ${path}`);
  // A symlink inside docs/ must not lead out of the repo either.
  if (!inside(realpathSync(full), realpathSync(ROOT)))
    throw new Error(`Path is outside the repository: ${path}`);
  const key = rel(full);
  if (!docFiles().includes(key))
    throw new Error(
      `Not a documentation file: ${path}. Use docs_search to find one.`,
    );
  return full;
}

export function docsRead(path: string): string {
  const text = read(resolveDoc(path));
  return text.length > MAX_READ
    ? `${text.slice(0, MAX_READ)}\n\n[truncated at ${MAX_READ} characters of ${text.length}]`
    : text;
}
