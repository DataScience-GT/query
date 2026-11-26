import { describe, expect, it } from "vitest";

import type { Graph, Lock } from "./install-parity.ts";
import { compareGraphs, expectedGraph } from "./install-parity.ts";

const linux = { os: "linux", cpu: "x64", libc: "glibc" };

// app -> a -> b, a -> native (linux x64 only) and mac -> a macOS-only binary
// whose own dependency nothing else needs. a has two peer variants.
const lock: Lock = {
  lockfileVersion: "9.0",
  importers: {
    ".": { dependencies: { app: { version: "link:packages/app" } } },
    "packages/app": {
      dependencies: { a: { version: "1.0.0(react@19.0.0)" } },
      devDependencies: { mac: { version: "1.0.0" } },
    },
  },
  packages: {
    "a@1.0.0": {},
    "b@2.0.0": {},
    "native@1.0.0": { os: ["linux"], cpu: ["x64"] },
    "mac@1.0.0": { os: ["darwin"] },
    "mac-dep@1.0.0": {},
  },
  snapshots: {
    "a@1.0.0(react@19.0.0)": { dependencies: { b: "2.0.0" } },
    "a@1.0.0(react@18.0.0)": { optionalDependencies: { native: "1.0.0" } },
    "b@2.0.0": {},
    "native@1.0.0": {},
    "mac@1.0.0": { dependencies: { "mac-dep": "1.0.0" } },
    "mac-dep@1.0.0": {},
  },
};

const noPeerLinks = () => false;

describe("expectedGraph", () => {
  it("installs what the host fits and what only fitting packages reach", () => {
    const { packages } = expectedGraph(lock, linux);
    expect([...packages].sort()).toEqual([
      "a@1.0.0",
      "b@2.0.0",
      "native@1.0.0",
    ]);
  });

  it("counts the links of every peer variant", () => {
    const { edges } = expectedGraph(lock, linux);
    expect(edges).toContain("a@1.0.0 -> b => b@2.0.0");
    expect(edges).toContain("a@1.0.0 -> native => native@1.0.0");
    expect(edges).toContain("importer:packages/app -> a => a@1.0.0");
    expect(edges).toContain("importer:. -> app => link:packages/app");
  });

  it("drops the native package on another host", () => {
    const mac = expectedGraph(lock, {
      os: "darwin",
      cpu: "arm64",
      libc: "glibc",
    });
    expect([...mac.packages].sort()).toEqual([
      "a@1.0.0",
      "b@2.0.0",
      "mac-dep@1.0.0",
      "mac@1.0.0",
    ]);
  });

  it("refuses a lockfile format it was not written for", () => {
    expect(() =>
      expectedGraph({ ...lock, lockfileVersion: "10.0" }, linux),
    ).toThrow(/lockfileVersion/);
  });

  it("refuses a dependency ref it cannot compare", () => {
    const git: Lock = {
      ...lock,
      snapshots: {
        ...lock.snapshots,
        "b@2.0.0": { dependencies: { c: "https://example.com/c.tgz" } },
      },
    };
    expect(() => expectedGraph(git, linux)).toThrow(
      /unsupported dependency ref/,
    );
  });
});

describe("compareGraphs", () => {
  const same = (): Graph => {
    const { packages, edges } = expectedGraph(lock, linux);
    return { packages: new Set(packages), edges: new Set(edges) };
  };

  it("passes an install that matches", () => {
    expect(
      compareGraphs(expectedGraph(lock, linux), same(), noPeerLinks),
    ).toEqual([]);
  });

  it("fails a package at another version", () => {
    const actual = same();
    actual.packages.delete("b@2.0.0");
    actual.packages.add("b@2.0.1");
    const problems = compareGraphs(
      expectedGraph(lock, linux),
      actual,
      noPeerLinks,
    );
    expect(problems).toContain("not installed by Bun: b@2.0.0");
    expect(problems).toContain("not in pnpm-lock.yaml: b@2.0.1");
  });

  it("fails a link wired to another version of the same package", () => {
    const actual = same();
    actual.edges.delete("a@1.0.0 -> b => b@2.0.0");
    actual.edges.add("a@1.0.0 -> b => b@1.0.0");
    const problems = compareGraphs(
      expectedGraph(lock, linux),
      actual,
      noPeerLinks,
    );
    expect(problems).toEqual([
      "link pnpm has, Bun lacks: a@1.0.0 -> b => b@2.0.0",
      "link Bun has, pnpm lacks: a@1.0.0 -> b => b@1.0.0",
    ]);
  });

  it("forgives a workspace's declared peer dependency, and nothing else", () => {
    const actual = same();
    actual.edges.add("importer:packages/app -> react => react@19.0.0");
    actual.edges.add("importer:packages/app -> stray => stray@1.0.0");
    const problems = compareGraphs(
      expectedGraph(lock, linux),
      actual,
      (importer, dep) => importer === "packages/app" && dep === "react",
    );
    expect(problems).toEqual([
      "link Bun has, pnpm lacks: importer:packages/app -> stray => stray@1.0.0",
    ]);
  });
});
