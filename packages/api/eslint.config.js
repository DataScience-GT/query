import base from "../../tooling/eslint/base.js";

export default [
  ...base,
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
