import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  drifted,
  packageFiles,
  readVersion,
  setVersion,
  SITE_PACKAGE,
} from "./versions.ts";

const repo = path.resolve(import.meta.dirname, "../../..");

describe("repo versions", () => {
  it("covers the root, packages, tooling and sites", () => {
    const files = packageFiles(repo);
    expect(files).toContain("package.json");
    expect(files).toContain(SITE_PACKAGE);
    expect(files).toContain("packages/core/package.json");
    expect(files).toContain("tooling/scripts/package.json");
  });

  it("gives every package the version of sites/mainweb", () => {
    const expected = readVersion(repo, SITE_PACKAGE);
    expect(
      drifted(repo).map((p) => `${p.name} is ${p.version}, not ${expected}`),
      "run `pnpm version:set <version>` to move them together",
    ).toEqual([]);
  });
});

describe("setVersion", () => {
  function fixture() {
    const root = mkdtempSync(path.join(tmpdir(), "versions-"));
    writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - sites/*\n  - tooling/*\n\ncatalog:\n  a: "1.0.0"\n',
    );
    for (const [dir, version] of [
      ["", "1.0.0"],
      ["sites/mainweb", "3.6.0"],
      ["tooling/x", "0.0.0"],
    ] as const) {
      mkdirSync(path.join(root, dir), { recursive: true });
      writeFileSync(
        path.join(root, dir, "package.json"),
        `{\n  "name": "n${dir.length}",\n  "version": "${version}",\n  "dependencies": {\n    "a": "1.0.0",\n    "version": "1.0.0"\n  }\n}\n`,
      );
    }
    return root;
  }

  it("names the packages that differ", () => {
    expect(drifted(fixture()).map((p) => p.file)).toEqual([
      "package.json",
      "tooling/x/package.json",
    ]);
  });

  it("rewrites only the version field", () => {
    const root = fixture();
    const file = path.join(root, "tooling/x/package.json");
    const before = readFileSync(file, "utf8");
    expect(setVersion(root, "3.7.0")).toHaveLength(3);
    expect(drifted(root)).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(
      before.replace('"version": "0.0.0"', '"version": "3.7.0"'),
    );
  });

  it("refuses a version that is not MAJOR.MINOR.PATCH", () => {
    expect(() => setVersion(fixture(), "3.7")).toThrow();
    expect(() => setVersion(fixture(), "3.7.1")).toThrow(/MAJOR\.MINOR\.0/);
  });
});
