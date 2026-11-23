import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * drizzle-orm has optional peers (zod, pg, ...). pnpm links one copy per
 * distinct peer set, so a package whose peers resolve differently gets its own
 * copy of the library. Two copies break `instanceof`, entity kinds and the SQL
 * types: one run of the upgrade to 1.0 had `@query/auth` on 4.6.7 of zod and
 * everything else on 4.6.6, and the types stopped lining up.
 *
 * Every consumer must resolve the same file on disk.
 */
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const resolveFrom = (absolute: string) =>
  realpathSync(createRequire(absolute).resolve("drizzle-orm"));

describe("drizzle-orm", () => {
  it("resolves to one copy for every workspace and for the auth adapter", () => {
    const consumers = [
      "packages/db/package.json",
      "packages/api/package.json",
      "packages/auth/package.json",
      "sites/mainweb/package.json",
    ].map((relative) => path.join(root, relative));

    // The adapter declares no dependencies of its own, so it finds drizzle-orm
    // through pnpm's hoisted store, which can pick a different copy.
    consumers.push(
      realpathSync(
        createRequire(path.join(root, "packages/auth/package.json")).resolve(
          "@auth/drizzle-adapter",
        ),
      ),
    );

    const resolved = consumers.map(resolveFrom);

    expect(new Set(resolved).size).toBe(1);
  });
});
