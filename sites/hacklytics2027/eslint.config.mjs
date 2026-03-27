import baseConfig from "@query/eslint-config/base";
import nextConfig from "@query/eslint-config/next-js";
import reactConfig from "@query/eslint-config/react";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [".next/**", "node_modules/**", "out/**"],
  },
  ...baseConfig,
  ...reactConfig,
  ...nextConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off"
    },
  },
];
