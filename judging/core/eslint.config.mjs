import { config } from "@query/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "process",
              importNames: ["env"],
              message:
                "@panel/core takes its inputs as arguments. It does not read the environment.",
            },
          ],
          patterns: [
            {
              group: ["@query", "@query/*"],
              message:
                "judging/ is a standalone product. Import from @panel/* only.",
            },
            {
              group: [
                "node:*",
                "fs",
                "path",
                "crypto",
                "node:fs",
                "node:path",
                "node:crypto",
              ],
              message:
                "@panel/core has no runtime dependencies and does not call Node APIs.",
            },
          ],
        },
      ],
    },
  },
];
