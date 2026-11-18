/**
 * The existing editions: which exist, which is latest, and what the latest one
 * says. The generator never types a venue, a link or a clock time of its own.
 * It loads the latest edition's `event.config.ts` through the kit and carries
 * every field over, so a field the kit adds later is carried over too.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import type { Plugin } from "vite";

import { SITES_DIR, editionDirName, editionYearOf } from "./paths";

const KIT_PACKAGE = "@query/event-kit";
const CAPTURE_KEY = "__hacklyticsEventInput";
const CAPTURE_MODULE = "\0hacklytics-generator:capture-kit";

/** Every edition's year, oldest first. */
export function listEditions(root: string): number[] {
  return readdirSync(join(root, SITES_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => editionYearOf(entry.name) ?? [])
    .sort((a, b) => a - b);
}

/** What a site decides once per edition: `defineEvent`'s input, minus the copy. */
export type EventCore = Record<string, unknown> & {
  brand: string;
  year: number;
  theme: { name: string; ground: { light: string; dark: string }; storageKey?: string };
  start: string;
  end: string;
  hacking: { start: string; end: string };
  registration: { validFrom: string };
};

export interface Edition {
  year: number;
  /** Repo-relative, with forward slashes: `sites/hacklytics2027`. */
  dir: string;
  core: EventCore;
  /** The fields of the built `EventConfig` this generator reads. */
  seo: Record<string, unknown>;
  timeZone: string;
}

/**
 * Wraps the kit's `defineEvent` for one module load, so the edition's own
 * input (its core fields, with no derived values mixed in) is captured while
 * the real function still runs and validates it.
 */
function captureKit(): Plugin {
  let realKit = "";
  return {
    name: "hacklytics-generator-capture-kit",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source === CAPTURE_MODULE) return source;
      if (source !== KIT_PACKAGE) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      realKit = resolved.id;
      return CAPTURE_MODULE;
    },
    load(id) {
      if (id !== CAPTURE_MODULE) return null;
      const real = JSON.stringify(realKit);
      return [
        `import { defineEvent as real } from ${real};`,
        `export * from ${real};`,
        `export const defineEvent = (input) => {`,
        `  globalThis.${CAPTURE_KEY} = input;`,
        `  return real(input);`,
        `};`,
      ].join("\n");
    },
  };
}

type Captured = { __hacklyticsEventInput?: Record<string, unknown> };

export async function loadEdition(root: string, year: number): Promise<Edition> {
  const dir = `${SITES_DIR}/${editionDirName(year)}`;
  const file = resolve(root, dir, "src", "event.config.ts");
  if (!existsSync(file)) throw new Error(`${dir}/src/event.config.ts does not exist`);

  const server = await createServer({
    root: resolve(root, dir),
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    plugins: [captureKit()],
  });
  try {
    const module = await server.ssrLoadModule(pathToFileURL(file).href);
    const input = (globalThis as Captured)[CAPTURE_KEY];
    const config = module.default as { seo: Record<string, unknown>; timeZone?: unknown };
    if (!input) throw new Error(`${dir}/src/event.config.ts did not call defineEvent`);
    const { content: _content, ...core } = input;
    const kit = (await server.ssrLoadModule(KIT_PACKAGE)) as { EVENT_TIME_ZONE?: string };
    const timeZone = (core.timeZone ?? config.timeZone ?? kit.EVENT_TIME_ZONE) as unknown;
    if (typeof timeZone !== "string") {
      throw new Error(`cannot tell which time zone ${dir} runs in`);
    }
    return { year, dir, core: structuredClone(core) as EventCore, seo: config.seo, timeZone };
  } finally {
    delete (globalThis as Captured)[CAPTURE_KEY];
    await server.close();
  }
}
