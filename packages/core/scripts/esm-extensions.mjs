// The source imports siblings without an extension, which Turbopack, Vite and
// the TypeScript bundler resolution in this repo all need. Node's ESM loader
// does not guess extensions, so the published dist/ adds .js to every
// relative specifier, in the JavaScript and in the .d.ts files alike.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(import.meta.dirname, "../dist");
const relative = /((?:from|import)\s*["'])(\.{1,2}\/[^"']+?)(["'])/g;

for (const file of readdirSync(dist)) {
  if (!/\.(js|d\.ts)$/.test(file)) continue;
  const full = path.join(dist, file);
  const before = readFileSync(full, "utf8");
  const after = before.replace(relative, (match, head, spec, tail) =>
    /\.(js|json)$/.test(spec) ? match : `${head}${spec}.js${tail}`,
  );
  if (after !== before) writeFileSync(full, after);
}
