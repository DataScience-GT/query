// Every workspace package, read from pnpm-workspace.yaml and each package.json.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { read, rel, ROOT } from "./source.ts";

export interface Workspace {
  name: string;
  path: string;
  version: string;
  private: boolean;
  description: string | null;
  scripts: Record<string, string>;
  /** Internal packages this one depends on through `workspace:*`. */
  dependsOn: string[];
  /** Internal packages that depend on this one. */
  dependedOnBy: string[];
}

// The `packages:` list is `- dir/*` lines; anything fancier would be a change
// to how the repo declares workspaces, and should fail loudly here.
export function workspaceGlobs(): string[] {
  const yaml = read(join(ROOT, "pnpm-workspace.yaml"));
  const block = /^packages:\s*\n((?:[ \t]+- .+\n?)+)/m.exec(yaml);
  if (!block) throw new Error("pnpm-workspace.yaml has no packages: list");
  return block[1]
    .split("\n")
    .map((line) => /^\s*-\s*["']?([^"'\s]+)["']?/.exec(line)?.[1])
    .filter((glob): glob is string => Boolean(glob));
}

export function workspaces(): Workspace[] {
  const found: Workspace[] = [];
  const internal: Record<string, string[]> = {};
  for (const glob of workspaceGlobs()) {
    if (!glob.endsWith("/*"))
      throw new Error(`Unsupported workspace glob ${glob}`);
    const parent = join(ROOT, glob.slice(0, -2));
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const manifest = join(parent, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(manifest)) continue;
      const pkg = JSON.parse(read(manifest));
      const deps: Record<string, string> = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
      };
      internal[pkg.name] = Object.entries(deps)
        .filter(([, range]) => String(range).startsWith("workspace:"))
        .map(([dep]) => dep)
        .sort();
      found.push({
        name: pkg.name,
        path: rel(join(parent, entry.name)),
        version: pkg.version ?? "",
        private: Boolean(pkg.private),
        description: pkg.description ?? null,
        scripts: pkg.scripts ?? {},
        dependsOn: internal[pkg.name],
        dependedOnBy: [],
      });
    }
  }
  for (const ws of found)
    for (const dep of ws.dependsOn)
      found.find((other) => other.name === dep)?.dependedOnBy.push(ws.name);
  for (const ws of found) ws.dependedOnBy.sort();
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

export const workspaceNames = () => workspaces().map((ws) => ws.name);

export function formatWorkspaces(list: Workspace[]): string {
  return list
    .map((ws) => {
      const scripts = Object.keys(ws.scripts).join(", ") || "none";
      return [
        `${ws.name}  ${ws.path}${ws.private ? "" : "  (published)"}`,
        ws.description ? `  ${ws.description}` : null,
        `  scripts: ${scripts}`,
        `  uses: ${ws.dependsOn.join(", ") || "none"}`,
        `  used by: ${ws.dependedOnBy.join(", ") || "none"}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
