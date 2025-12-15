// Import the local tooling PostCSS config directly to avoid module
// resolution issues with Turbopack's static analysis.
import { postcssConfig } from "../../tooling/tailwind/postcss.config.js";

export default postcssConfig;
