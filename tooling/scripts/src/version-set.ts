/**
 * Sets one version in every workspace package.json, so they stay in step with
 * `sites/mainweb`. Run from the repo root.
 *
 *   pnpm version:set 3.7.0
 */
import { setVersion } from "./versions.ts";

const version = process.argv[2];
if (!version) {
  console.error("Usage: pnpm version:set MAJOR.MINOR.PATCH");
  process.exit(1);
}
const changed = setVersion(process.cwd(), version);
console.log(
  changed.length
    ? `Set ${version} in:\n${changed.map((f) => `  ${f}`).join("\n")}`
    : `Every package.json is already ${version}.`,
);
