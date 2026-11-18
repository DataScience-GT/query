/**
 * Rewrites internal dependencies a tool flattened to `"*"` back to
 * `workspace:*`, in every package.json under the current directory.
 *
 *   node tooling/scripts/src/restore-workspace.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const INTERNAL = new Set([
  "@query/api",
  "@query/auth",
  "@query/core",
  "@query/db",
  "@query/ui",
  "@query/oxlint-config",
  "@query/prettier-config",
  "@query/tsconfig",
]);

const SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
] as const;

type PackageJson = Partial<
  Record<(typeof SECTIONS)[number], Record<string, string>>
>;

function restoreFile(file: string): void {
  const json = JSON.parse(readFileSync(file, "utf8")) as PackageJson;
  let changed = false;
  for (const section of SECTIONS) {
    const deps = json[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (INTERNAL.has(name) && deps[name] === "*") {
        deps[name] = "workspace:*";
        changed = true;
      }
    }
  }
  if (changed) writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}

function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") walk(full);
    } else if (entry.name === "package.json") {
      try {
        restoreFile(full);
      } catch (e) {
        console.error(`Error processing ${full}: ${(e as Error).message}`);
      }
    }
  }
}

walk(process.cwd());
