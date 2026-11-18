import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { listEditions, loadEdition } from "./editions";
import { kitPublicFiles } from "./kit";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const latestYear = Math.max(...listEditions(root));
const kitSrc = `${root}packages/event-kit/src`;

describe("what the kit asks of a site", () => {
  it("reads the root-level files its components link to", () => {
    expect(kitPublicFiles(kitSrc)).toEqual(
      expect.arrayContaining([
        "/favicon.ico",
        "/mlh-trust-badge.svg",
        "/sw.js",
      ]),
    );
  });
});

describe("the latest edition against the kit", () => {
  it("ships every file the kit links to, so the generator has something to copy", async () => {
    const edition = await loadEdition(root, latestYear);
    for (const file of edition.kit.publicFiles) {
      expect(existsSync(`${root}${edition.dir}/public${file}`), file).toBe(
        true,
      );
    }
  }, 60_000);
});
