import { fileURLToPath } from "url";
import { dirname, join } from "path";

/** @typedef {import("prettier").Config} PrettierConfig */
/** @typedef {import("prettier-plugin-tailwindcss").PluginOptions} TailwindConfig */
/** @typedef {import("@ianvs/prettier-plugin-sort-imports").PluginConfig} SortImportsConfig */

/** @type {PrettierConfig & SortImportsConfig & TailwindConfig} */
const config = {
  plugins: [
    "@ianvs/prettier-plugin-sort-imports",
    "prettier-plugin-tailwindcss",
  ],

  // Ensure Tailwind config path works in ESM
  tailwindConfig: join(
    dirname(fileURLToPath(import.meta.url)),
    "../tailwind/web.ts"
  ),
  tailwindFunctions: ["cn", "cva"],

  // Sort imports
  importOrder: [
    "<TYPES>",
    "^(react/(.*)$)|^(react$)|^(react-native(.*)$)",
    "^(next/(.*)$)|^(next$)",
    "^(expo(.*)$)|^(expo$)",
    "<THIRD_PARTY_MODULES>",
    "",
    "<TYPES>^@query",
    "^@query/(.*)$",
    "",
    "<TYPES>^[.|..|~]",
    "^~/",
    "^[../]",
    "^[./]"
  ],
  importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
  importOrderTypeScriptVersion: "4.4.0",

  // File-specific overrides
  overrides: [
    {
      files: "*.json.hbs",
      options: { parser: "json" },
    },
    {
      files: "*.js.hbs",
      options: { parser: "babel" },
    },
  ],
};

export default config;
