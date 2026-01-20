import baseConfig from "@query/eslint-config/base";
import nextJsConfig from "@query/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [baseConfig, ...nextJsConfig];
