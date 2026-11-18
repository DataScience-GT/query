import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { listEditions, loadEdition } from "./editions";
import { kitPublicFiles, requiredThemeTokens } from "./kit";
import { declaredValue, neutralTheme } from "./theme";

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

  it("reads the theme tokens from the stylesheet's header", () => {
    expect(
      requiredThemeTokens(readFileSync(`${kitSrc}/styles/kit.css`, "utf8")),
    ).toEqual(
      expect.arrayContaining([
        "--ground",
        "--bloom",
        "--navbar-height",
        "--ease",
      ]),
    );
  });

  it("refuses a stylesheet that lists none", () => {
    expect(() => requiredThemeTokens("/* nothing here */")).toThrow(
      /theme tokens/,
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

  it("is covered by the neutral starter, which fails here when the kit adds a theme token it lacks", async () => {
    const edition = await loadEdition(root, latestYear);
    const css = readFileSync(
      `${root}${edition.dir}/src/styles/globals.css`,
      "utf8",
    );
    const theme = neutralTheme(edition.kit.themeTokens, (token) =>
      declaredValue(css, token),
    );
    for (const token of edition.kit.themeTokens) {
      expect(declaredValue(theme, token), token).toBeDefined();
    }
  }, 60_000);
});
