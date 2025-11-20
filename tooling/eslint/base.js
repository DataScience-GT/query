import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import turboPlugin from "eslint-plugin-turbo";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      turbo: turboPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "import/consistent-type-specifier-style": ["error", "prefer-inline"],
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    ignores: [
      "dist/**",
      "build/**",
      ".next/**",
      "node_modules/**",
      "*.config.js",
      "*.config.ts",
    ],
  },
];
