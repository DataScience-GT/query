import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("standalone tree", () => {
  it("does not mention the host club", async () => {
    const hits: string[] = [];
    await walk(root, hits);
    expect(hits).toEqual([]);
  });
});

async function walk(dir: string, hits: string[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path, hits);
      continue;
    }
    if (!/\.(ts|tsx|md|sql|yml|json|tf)$/.test(entry.name)) continue;
    const text = await readFile(path, "utf8");
    const needles = ["DS" + "GT", "Hack" + "lytics", "datascience" + "gt"];
    if (needles.some((needle) => text.toLowerCase().includes(needle.toLowerCase()))) {
      hits.push(path);
    }
  }
}
