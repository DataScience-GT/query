import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import eslint from "eslint";
import importPlugin from "eslint-plugin-import";
import turboPlugin from "eslint-plugin-turbo";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/** Helper for resolving paths */
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Restrict direct access to `process.env` in t3-env projects
 */
export const restrictEnvAccess = {
  files: ["**/*.js", "**/*.ts", "**/*.tsx"],
  ignores: ["**/env.ts"],
  rules: {
    "no-restricted-properties": [
      "error",
      {
        object: "process",
        property: "env",
        message:
          "Use `import { env } from '~/env'` instead to ensure validated types.",
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        name: "process",
        importNames: ["env"],
        message:
          "Use `import { env } from '~/env'` instead to ensure validated types.",
      },
    ],
  },
};

/**
 * Main ESLint configuration
 */
const config = {
  root: true,
  ignores: ["**/*.config.*"],
  files: ["**/*.js", "**/*.ts", "**/*.tsx"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: "./tsconfig.json",
  },
  plugins: {
    "@typescript-eslint": tsPlugin,
    import: importPlugin,
    turbo: turboPlugin,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:@typescript-eslint/stylistic-type-checked",
  ],
  rules: {
    ...turboPlugin.configs.recommended.rules,
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      { prefer: "type-imports", fixStyle: "separate-type-imports" },
    ],
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
    "@typescript-eslint/no-unnecessary-condition": [
      "error",
      { allowConstantLoopConditions: true },
    ],
    "@typescript-eslint/no-non-null-assertion": "error",
    "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
    "no-console": "warn",
  },
  linterOptions: { reportUnusedDisableDirectives: true },
};

export default config;
export { config as eslintConfig };
