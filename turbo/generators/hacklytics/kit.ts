/**
 * What the event kit asks of a site, read from the kit's own files so the
 * generator tracks the kit instead of keeping a copy of its contract.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A quoted path to a file at the root of the site: "/favicon.ico", "/sw.js". */
const ROOT_FILE = /["'`](\/[\w.-]+\.[a-z0-9]+)["'`]/g;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(astro|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name))
      yield path;
  }
}

/**
 * The files the kit's components link to by path, which a site must serve
 * from its `public/`: the icons, the MLH badge, the service worker.
 */
export function kitPublicFiles(srcDir: string): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(srcDir)) {
    for (const match of readFileSync(file, "utf8").matchAll(ROOT_FILE))
      found.add(match[1]);
  }
  return [...found].sort();
}
