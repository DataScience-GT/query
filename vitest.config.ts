import { globSync, readFileSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "path";

// Agent worktrees live under .claude/worktrees inside the repo, and the path
// filters in `pnpm test` would otherwise match their copies too. `next build`
// copies the tests into .next/standalone, where they fail on every import.
const SKIPPED = [...configDefaults.exclude, ".claude/**", "**/.next/**"];

// A test file that swaps a module or the environment leaves that behind for
// whatever runs next in its worker: a mocked @query/db made the next file fail
// with `No "subteams" export`. Those files keep a worker to themselves, and
// the rest share workers rather than reloading the app for each file. Decided
// from the source so a new test lands in the right group by itself.
const LEAKS_STATE =
  /vi\.(mock|doMock|stubEnv|stubGlobal)\(|process\.env\.\w+\s*=[^=]/;
// The second pattern because globSync skips dot-folders, and a leading ** does
// not reach into them either.
const leaky = globSync(
  ["**/*.test.{ts,tsx}", "packages/*/src/.internal-tests/*.test.ts"],
  {
    exclude: (name) =>
      name === "node_modules" || name === ".next" || name === ".claude",
  },
)
  .filter((file) => LEAKS_STATE.test(readFileSync(file, "utf8")))
  // Backslashes on Windows, which vitest's globs do not match.
  .map((file) => file.replaceAll("\\", "/"));

// Root config for `pnpm test`. The `@` alias is mainweb's, a tsconfig path Node
// cannot resolve on its own: without it, a test cannot import a route handler.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "sites/mainweb"),
    },
  },
  test: {
    maxWorkers: "100%",
    exclude: SKIPPED,
    projects: [
      {
        extends: true,
        test: {
          name: "shared",
          isolate: false,
          exclude: [...SKIPPED, ...leaky],
        },
      },
      { extends: true, test: { name: "isolated", include: leaky } },
    ],
  },
});
