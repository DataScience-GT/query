/**
 * Self-contained on purpose.
 *
 * This used to re-export tooling/tailwind/postcss.config.js. Turbopack
 * evaluates the PostCSS config in its own Node sandbox, and that cross-package
 * import failed there with "__turbopack_context__.a is not a function",
 * breaking every CSS import in the app — globals.css, liquid-glass.css and the
 * geist font modules. It reproduced on a clean CI runner with no cache.
 *
 * The config is four lines, so it is inlined rather than shared, matching
 * sites/hacklytics2027/postcss.config.mjs, which never had the problem.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
