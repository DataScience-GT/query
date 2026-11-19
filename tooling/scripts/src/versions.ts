/**
 * Every workspace package carries the same `version` as `sites/mainweb`.
 * These helpers find the package.json files from the globs in
 * `pnpm-workspace.yaml` and read or rewrite that one field.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SITE_PACKAGE = "sites/mainweb/package.json";

const VERSION_FIELD = /^( {2}"version": ")([^"]*)(")/m;

/** package.json paths, relative to `root`: the root one, then each workspace. */
export function packageFiles(root: string): string[] {
  const yaml = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const block = /^packages:\n((?:[ \t]+-.*\n?)+)/m.exec(yaml)?.[1] ?? "";
  const files = ["package.json"];
  for (const line of block.split("\n")) {
    const glob = /^\s*-\s*["']?([^"'\s]+)["']?\s*$/.exec(line)?.[1];
    if (!glob) continue;
    if (!glob.endsWith("/*") || glob.slice(0, -2).includes("*")) {
      throw new Error(`Unsupported workspace glob "${glob}"`);
    }
    const dir = glob.slice(0, -2);
    if (!existsSync(path.join(root, dir))) continue;
    for (const entry of readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const file = `${dir}/${entry.name}/package.json`;
      if (entry.isDirectory() && existsSync(path.join(root, file))) {
        files.push(file);
      }
    }
  }
  return files;
}

function readJson(
  root: string,
  file: string,
): { name: string; version?: string } {
  return JSON.parse(readFileSync(path.join(root, file), "utf8")) as {
    name: string;
    version?: string;
  };
}

export function readVersion(root: string, file: string): string {
  const { version } = readJson(root, file);
  if (typeof version !== "string") throw new Error(`${file} has no "version"`);
  return version;
}

/** Packages whose version differs from the site's, with what they carry. */
export function drifted(
  root: string,
): { name: string; file: string; version: string }[] {
  const expected = readVersion(root, SITE_PACKAGE);
  return packageFiles(root).flatMap((file) => {
    const version = readVersion(root, file);
    return version === expected
      ? []
      : [{ name: readJson(root, file).name, file, version }];
  });
}

/** Rewrites only the `version` field of every package.json. Returns the files changed. */
export function setVersion(root: string, version: string): string[] {
  // The site's PATCH is counted at build time, so the files hold MAJOR.MINOR.0.
  if (!/^\d+\.\d+\.0$/.test(version)) {
    throw new Error(`"${version}" is not MAJOR.MINOR.0`);
  }
  const changed: string[] = [];
  for (const file of packageFiles(root)) {
    const full = path.join(root, file);
    const text = readFileSync(full, "utf8");
    if (!VERSION_FIELD.test(text)) throw new Error(`${file} has no "version"`);
    const next = text.replace(VERSION_FIELD, `$1${version}$3`);
    if (next !== text) {
      writeFileSync(full, next);
      changed.push(file);
    }
  }
  return changed;
}
