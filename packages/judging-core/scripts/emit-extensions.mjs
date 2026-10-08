import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist");

await walk(dist);

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    const source = await readFile(path, "utf8");
    const next = source.replaceAll(
      /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
      (match, open, spec, close) =>
        spec.endsWith(".js") ? match : `${open}${spec}.js${close}`,
    );
    if (next !== source) await writeFile(path, next);
  }
}
