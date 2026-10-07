import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("@panel/core package", () => {
  it("has no runtime dependencies", () => {
    const packageJson = join(dirname(fileURLToPath(import.meta.url)), "../package.json");
    const pkg = JSON.parse(readFileSync(packageJson, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
