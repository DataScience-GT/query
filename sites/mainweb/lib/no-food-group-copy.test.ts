import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Hackers know their flower as a "bloom". "Food group" is the internal name and
// stays in identifiers (foodGroup, food_group), never in copy they can read.
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const HACKER_FACING = [
  "sites/mainweb/components/hackathon",
  "sites/mainweb/app/(portal)/hackathons",
  "sites/mainweb/app/(portal)/hacklytics",
  "sites/mainweb/app/(portal)/dashboard",
  "sites/mainweb/lib/hackathon-next-step.ts",
  "packages/auth/src/email.ts",
  "tooling/scripts/src/discord-register-metadata.ts",
];
// A space or hyphen between the words, so foodGroup and food_group pass.
const PHRASE = /food[ -]+group/i;

const sourcesIn = (path: string): string[] =>
  statSync(join(ROOT, path)).isFile()
    ? [path]
    : readdirSync(join(ROOT, path), { recursive: true, encoding: "utf8" })
        .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
        .map((f) => join(path, f));

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

describe("hacker-facing copy", () => {
  it("scans real files in every listed place", () => {
    for (const path of HACKER_FACING) expect(sourcesIn(path), path).not.toEqual([]);
  });

  it('never says "food group"', () => {
    const hits = HACKER_FACING.flatMap(sourcesIn).flatMap((file) =>
      withoutComments(readFileSync(join(ROOT, file), "utf8"))
        .split("\n")
        .filter((line) => PHRASE.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });
});
