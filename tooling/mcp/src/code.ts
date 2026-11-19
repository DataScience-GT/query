// The four code-graph tools. Each returns terse text with file:line, capped,
// so an agent can navigate without reading whole files.
import { isAbsolute, relative } from "node:path";

import type { Edge, FileInfo, Graph } from "./graph.ts";
import { procedures } from "./api.ts";
import { getGraph } from "./graph.ts";
import { routes } from "./routes.ts";
import { ROOT } from "./source.ts";
import { workspaces } from "./workspace.ts";

const MAX_SYMBOLS = 25;
const MAX_IMPORTS = 60;
const MAX_DECLS = 150;
const MAX_TREE_LINES = 150;
const MAX_IMPACT_FILES = 12;
const MAX_ROUTES = 60;

function capped(lines: string[], max: number): string[] {
  return lines.length > max
    ? [...lines.slice(0, max), `truncated, ${lines.length - max} more`]
    : lines;
}

// A repo-relative file in the graph, from whatever form the caller wrote.
function fileFor(graph: Graph, input: string): string {
  let path = input.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (isAbsolute(input)) path = relative(ROOT, input).replaceAll("\\", "/");
  if (path.startsWith(".."))
    throw new Error(`Path is outside the repository: ${input}`);
  if (graph.files.has(path)) return path;
  const tails = [...graph.files.keys()].filter((f) => f.endsWith(`/${path}`));
  if (tails.length === 1) return tails[0];
  const base = path.split("/").pop() ?? path;
  const near = [...graph.files.keys()]
    .filter((f) => f.endsWith(`/${base}`) || f === base)
    .slice(0, 5);
  throw new Error(
    tails.length > 1
      ? `Ambiguous path ${input}: ${tails.slice(0, 5).join(", ")}`
      : `Not in the code graph: ${input}.${near.length ? ` Similar: ${near.join(", ")}` : ""}`,
  );
}

// --- code_symbol -------------------------------------------------------

export function codeSymbol(name: string): string {
  const query = name.trim();
  if (!query) throw new Error("Empty symbol name");
  const lower = query.toLowerCase();
  const graph = getGraph();
  const hits: {
    rank: number;
    exported: boolean;
    file: string;
    text: string;
  }[] = [];
  for (const info of graph.files.values()) {
    for (const d of info.decls) {
      const names = [d.name.toLowerCase(), d.exportedAs?.toLowerCase()].filter(
        Boolean,
      ) as string[];
      let rank = -1;
      if (d.name === query || d.exportedAs === query) rank = 0;
      else if (names.includes(lower)) rank = 1;
      else if (names.some((n) => n.startsWith(lower))) rank = 2;
      else if (names.some((n) => n.includes(lower))) rank = 3;
      if (rank === -1) continue;
      const alias = d.exportedAs ? ` (exported as ${d.exportedAs})` : "";
      hits.push({
        rank,
        exported: d.exported,
        file: info.file,
        text: `${info.file}:${d.start}  ${d.kind}${d.exported ? "" : " local"}  ${d.sig}${alias}`,
      });
    }
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.exported) - Number(a.exported) ||
      a.file.localeCompare(b.file),
  );
  const lines: string[] = [];
  // A dotted name is a tRPC path such as `admin.list`.
  if (query.includes(".")) {
    for (const p of procedures().filter(
      (p) => p.path === query || p.path.startsWith(`${query}.`),
    ))
      lines.push(
        `${p.file}:${p.line}  procedure ${p.path}  ${p.type}  ${p.kind.join(" > ")}`,
      );
  }
  lines.push(...hits.map((h) => h.text));
  if (!lines.length) return `No symbol matching "${query}".`;
  return capped(lines, MAX_SYMBOLS).join("\n");
}

// --- code_outline ------------------------------------------------------

const importLabel = (e: Edge) =>
  e.kind === "type"
    ? "type "
    : e.kind === "reexport"
      ? "reexport "
      : e.kind === "dynamic"
        ? "dynamic "
        : e.kind === "require"
          ? "require "
          : "";

function namesOf(names: string[]): string {
  if (!names.length) return "";
  const shown = names.slice(0, 6).join(", ");
  return ` {${shown}${names.length > 6 ? `, +${names.length - 6}` : ""}}`;
}

export function codeOutline(path: string): string {
  const graph = getGraph();
  const file = fileFor(graph, path);
  const info = graph.files.get(file) as FileInfo;
  const edges = graph.out.get(file) ?? [];
  const head = `${file}${info.client ? "  [client]" : ""}${info.parseError ? `  [parse error: ${info.parseError}]` : ""}`;

  const internal = edges.filter((e) => !e.external);
  const externals = [
    ...new Set(
      edges.filter((e) => e.external).map((e) => e.external as string),
    ),
  ];
  const importLines = internal.map((e) => {
    const target = e.to ?? (e.asset ? `${e.asset} (asset)` : "UNRESOLVED");
    return `  L${e.line} ${importLabel(e)}${e.spec}${namesOf(e.names)} -> ${target}`;
  });
  if (externals.length) importLines.push(`  external: ${externals.join(", ")}`);

  const declLines = info.decls.map((d) => {
    const range = d.start === d.end ? `L${d.start}` : `L${d.start}-${d.end}`;
    return `  ${range} ${d.kind}${d.exported ? "" : " local"}  ${d.sig}`;
  });
  return [
    head,
    `imports (${edges.length}):`,
    ...capped(importLines, MAX_IMPORTS),
    `declarations (${info.decls.length}):`,
    ...capped(declLines, MAX_DECLS),
  ].join("\n");
}

// --- code_deps ---------------------------------------------------------

// Edges between two files, merged: kinds seen and the first line.
function merged(edges: Edge[], pick: (e: Edge) => string | undefined) {
  const byTarget = new Map<string, { kinds: Set<string>; line: number }>();
  for (const e of edges) {
    const key = pick(e);
    if (!key) continue;
    const entry = byTarget.get(key) ?? { kinds: new Set(), line: e.line };
    entry.kinds.add(e.kind);
    byTarget.set(key, entry);
  }
  return byTarget;
}

const kindTag = (kinds: Set<string>) =>
  kinds.size === 1 && kinds.has("type")
    ? "  [type-only]"
    : kinds.has("dynamic") && kinds.size === 1
      ? "  [dynamic]"
      : kinds.has("reexport")
        ? "  [reexport]"
        : "";

export function codeDeps(
  path: string,
  direction: "imports" | "importers" = "imports",
  depth = 1,
): string {
  const graph = getGraph();
  const root = fileFor(graph, path);
  const lines: string[] = [`${root}  (${direction}, depth ${depth})`];
  const seen = new Set<string>([root]);
  const importers = direction === "importers";

  const visit = (file: string, level: number) => {
    const edges = importers
      ? (graph.inn.get(file) ?? [])
      : (graph.out.get(file) ?? []);
    const targets = merged(edges, (e) => (importers ? e.from : e.to));
    const pad = "  ".repeat(level);
    for (const [target, { kinds, line }] of [...targets].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const again = seen.has(target);
      const where = importers ? `  :${line}` : "";
      lines.push(
        `${pad}${importers ? "<-" : "->"} ${target}${where}${kindTag(kinds)}${again ? "  (seen)" : ""}`,
      );
      if (!again) {
        seen.add(target);
        if (level < depth) visit(target, level + 1);
      }
    }
    if (!importers) {
      const external = [
        ...new Set(
          edges.filter((e) => e.external).map((e) => e.external as string),
        ),
      ];
      const assets = edges.filter((e) => e.asset).map((e) => e.asset as string);
      const broken = edges.filter((e) => e.unresolved).map((e) => e.spec);
      if (external.length)
        lines.push(
          `${pad}external: ${external.slice(0, 12).join(", ")}${external.length > 12 ? `, +${external.length - 12}` : ""}`,
        );
      if (assets.length) lines.push(`${pad}assets: ${assets.join(", ")}`);
      if (broken.length) lines.push(`${pad}UNRESOLVED: ${broken.join(", ")}`);
    }
  };
  visit(root, 1);
  if (lines.length === 1)
    lines.push(importers ? "  no importers" : "  no imports");
  return capped(lines, MAX_TREE_LINES).join("\n");
}

// --- code_impact -------------------------------------------------------

const ENTRY_FILES = new Set([
  "proxy.ts",
  "instrumentation.ts",
  "middleware.ts",
  "next.config.mjs",
]);
const isTest = (file: string) =>
  /\.(test|spec)\.[cm]?[tj]sx?$/.test(file) ||
  file.includes("/.internal-tests/");

export function codeImpact(target: string): string {
  const graph = getGraph();
  const input = target.trim();
  let seeds: string[];
  let label: string;
  try {
    seeds = [fileFor(graph, input)];
    label = seeds[0];
  } catch (error) {
    // Not a path: a symbol, and every file that declares it exported.
    seeds = [...graph.files.values()]
      .filter((f) =>
        f.decls.some(
          (d) => d.exported && (d.name === input || d.exportedAs === input),
        ),
      )
      .map((f) => f.file);
    if (!seeds.length) throw error;
    label = `symbol ${input}, declared in ${seeds.join(", ")} (file-level impact)`;
  }

  // Breadth-first over importers, remembering the distance.
  const distance = new Map<string, number>(seeds.map((s) => [s, 0]));
  let frontier = [...seeds];
  while (frontier.length) {
    const next: string[] = [];
    for (const file of frontier)
      for (const edge of graph.inn.get(file) ?? [])
        if (!distance.has(edge.from)) {
          distance.set(edge.from, (distance.get(file) ?? 0) + 1);
          next.push(edge.from);
        }
    frontier = next;
  }
  const impacted = [...distance.keys()].filter((f) => !seeds.includes(f));
  const maxDepth = Math.max(0, ...distance.values());

  const wsList = workspaces();
  const wsOf = (file: string) =>
    wsList.find((ws) => file.startsWith(`${ws.path}/`))?.name ?? "(none)";
  const groups = new Map<string, string[]>();
  for (const file of impacted)
    groups.set(wsOf(file), [...(groups.get(wsOf(file)) ?? []), file]);

  const lines = [
    `impact of ${label}`,
    `${impacted.length} files import it transitively (max depth ${maxDepth})`,
  ];
  if (!impacted.length) return lines.join("\n");

  lines.push(
    `by workspace: ${[...groups]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, files]) => `${name} ${files.length}`)
      .join(", ")}`,
  );

  // Routes: a page, route handler or layout in the set. A layout in the set
  // reaches every route under it.
  const inSet = (file: string) => distance.has(file);
  const routeLines: string[] = [];
  for (const route of routes()) {
    const direct = route.files.filter((f) => inSet(f.file));
    const layouts = route.layouts.filter(inSet);
    if (!direct.length && !layouts.length) continue;
    const parts = direct.map(
      (f) =>
        `${f.kind}${f.kind === "route" ? "" : f.client ? " [client]" : " [server]"} ${f.file}`,
    );
    // Say which layout only when the route has no file of its own in the set.
    if (!direct.length) parts.push(`via layout ${layouts[layouts.length - 1]}`);
    routeLines.push(`  ${route.url}  ${route.group}  ${parts.join("; ")}`);
  }
  const layoutsHit = [...distance.keys()].filter((f) =>
    /\/app\/(?:.*\/)?layout\.[jt]sx?$/.test(f),
  );
  if (layoutsHit.length)
    lines.push(
      `layouts reached (cover every route under them): ${layoutsHit.map((f) => `${f}${graph.files.get(f)?.client ? " [client]" : ""}`).join(", ")}`,
    );
  lines.push(
    `mainweb routes reached: ${routeLines.length}`,
    ...capped(routeLines, MAX_ROUTES),
  );

  const entries = impacted.filter((f) =>
    ENTRY_FILES.has(f.split("/").pop() ?? ""),
  );
  if (entries.length) lines.push(`entry points: ${entries.join(", ")}`);

  for (const [name, files] of [...groups].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    const tests = files.filter(isTest).length;
    const code = files
      .filter((f) => !isTest(f))
      .sort(
        (a, b) =>
          (distance.get(a) ?? 0) - (distance.get(b) ?? 0) || a.localeCompare(b),
      );
    lines.push(
      `${name}: ${code.length} files${tests ? `, ${tests} test files` : ""}`,
    );
    for (const file of code.slice(0, MAX_IMPACT_FILES))
      lines.push(`  d${distance.get(file)} ${file}`);
    if (code.length > MAX_IMPACT_FILES)
      lines.push(`  truncated, ${code.length - MAX_IMPACT_FILES} more`);
  }
  return lines.join("\n");
}
