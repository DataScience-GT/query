import { createRequire } from "node:module";

import baseJson from "./base.json" with { type: "json" };
import nextJson from "./next.json" with { type: "json" };
import reactInternalJson from "./react-internal.json" with { type: "json" };
import reactJson from "./react.json" with { type: "json" };

const require = createRequire(import.meta.url);

// oxlint resolves a jsPlugins name from the workspace that extends the config,
// and only this package depends on the plugins. Resolving them here turns each
// name into an absolute path that loads from any workspace.
const withPlugins = ({ jsPlugins, ...config }) =>
  jsPlugins
    ? { ...config, jsPlugins: jsPlugins.map((name) => require.resolve(name)) }
    : config;

export const base = withPlugins(baseJson);
export const next = withPlugins(nextJson);
export const react = withPlugins(reactJson);
export const reactInternal = withPlugins(reactInternalJson);
