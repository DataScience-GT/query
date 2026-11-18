import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { listEditions, loadEdition } from "./editions";
import { buildPlan } from "./plan";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const years = listEditions(root);
const latestYear = Math.max(...years);

describe("the latest edition, loaded through the kit", () => {
  it("lists the editions in sites/, oldest first", () => {
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(years.length).toBeGreaterThan(0);
  });

  it("gives its defineEvent input with no copy and no derived values mixed in", async () => {
    const edition = await loadEdition(root, latestYear);
    expect(edition.core.year).toBe(latestYear);
    expect(edition.core).not.toHaveProperty("content");
    expect(edition.core).not.toHaveProperty("startMs");
    expect(edition.core).not.toHaveProperty("dates");
    expect(edition.timeZone).toMatch(/^\w+\/\w+/);
  }, 60_000);

  it("is enough to plan the next edition", async () => {
    const edition = await loadEdition(root, latestYear);
    const next = latestYear + 1;
    const plan = buildPlan(
      {
        year: String(next),
        theme: "Test Theme",
        start: `${next}-02-26`,
        end: `${next}-02-28`,
      },
      {
        latest: edition,
        existing: years,
        themeCss: readFileSync(
          `${root}${edition.dir}/src/styles/globals.css`,
          "utf8",
        ),
        packageJson: readFileSync(`${root}${edition.dir}/package.json`, "utf8"),
      },
    );
    expect(plan.siteName).toBe(`hacklytics${next}`);
    expect(JSON.parse(`{${plan.core}}`).year).toBe(next);
  }, 60_000);
});
