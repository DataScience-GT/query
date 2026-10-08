import { config } from "@query/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/env.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@query", "@query/*"],
              message:
                "judging/ is a standalone product. Import from @panel/* only.",
            },
          ],
        },
      ],
    },
  },
];
