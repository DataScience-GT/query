// A code graph of sites/*, packages/* and tooling/*, built from source when a
// tool asks for it: each file is parsed once with @babel/parser (TypeScript's
// own JS API is gone in 7.x) into its imports and top-level declarations, then
// import specifiers are resolved to files. The result is cached in memory and
// refreshed from file mtimes, so a repeat call costs a directory walk and a
// stat per file.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, posix, resolve } from "node:path";
import { parse } from "@babel/parser";

import { readIfChanged, rel, ROOT, stripComments } from "./source.ts";
import { workspaces } from "./workspace.ts";

const ROOTS = ["sites", "packages", "tooling"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "out",
  "dist",
  "build",
  "coverage",
  "graphify-out",
  "public",
  ".turbo",
  ".cache",
  ".astro",
  ".git",
  ".claude",
]);
const CODE_EXT = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".astro",
];

type ImportKind =
  "import" | "type" | "reexport" | "dynamic" | "require" | "side-effect";

interface ImportRec {
  spec: string;
  kind: ImportKind;
  line: number;
  /** Imported names, `*` for a namespace or `export *`, `default`. */
  names: string[];
}

type DeclKind =
  | "function"
  | "component"
  | "class"
  | "const"
  | "type"
  | "interface"
  | "enum"
  | "router"
  | "procedure"
  | "table";

interface Decl {
  name: string;
  kind: DeclKind;
  exported: boolean;
  isDefault: boolean;
  /** Name it is exported under, when it differs from `name`. */
  exportedAs?: string;
  start: number;
  end: number;
  sig: string;
}

export interface FileInfo {
  file: string;
  mtime: number;
  size: number;
  imports: ImportRec[];
  decls: Decl[];
  /** Opens with a "use client" directive. */
  client: boolean;
  parseError?: string;
}

export interface Edge {
  from: string;
  spec: string;
  kind: ImportKind;
  line: number;
  names: string[];
  /** Repo file the specifier resolves to. */
  to?: string;
  /** npm package or Node builtin, not expanded. */
  external?: string;
  /** A non-code file such as css, json or svg. */
  asset?: string;
  unresolved?: boolean;
}

export interface Graph {
  files: Map<string, FileInfo>;
  /** What each file imports. */
  out: Map<string, Edge[]>;
  /** Edges pointing at each file. */
  inn: Map<string, Edge[]>;
  builtMs: number;
}

// --- parsing -----------------------------------------------------------

type Node = {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number }; end: { line: number } };
  // oxlint-disable-next-line typescript/no-explicit-any
  [key: string]: any;
};

const SKIP_KEYS = new Set([
  "loc",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "extra",
  "range",
]);

function walkAst(node: unknown, visit: (n: Node) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit);
    return;
  }
  const n = node as Node;
  if (typeof n.type === "string") visit(n);
  for (const key of Object.keys(n))
    if (!SKIP_KEYS.has(key)) walkAst(n[key], visit);
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();
const clip = (text: string, max = 140) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const isPascal = (name: string) =>
  /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name);

function unwrap(node: Node | null | undefined): Node | null {
  let n = node ?? null;
  while (
    n &&
    [
      "TSAsExpression",
      "TSSatisfiesExpression",
      "ParenthesizedExpression",
      "TSNonNullExpression",
      "TSTypeAssertion",
    ].includes(n.type)
  )
    n = n.expression;
  return n;
}

// The identifier at the start of `a.b(c).d(e)`, and the name called directly.
function callRoot(call: Node): { root: string | null; direct: string | null } {
  const direct = call.callee.type === "Identifier" ? call.callee.name : null;
  let n: Node = call.callee;
  for (;;) {
    if (n.type === "MemberExpression") n = n.object;
    else if (n.type === "CallExpression") n = n.callee;
    else break;
  }
  return { root: n.type === "Identifier" ? n.name : null, direct };
}

function kindOfInit(name: string, init: Node | null, jsx: boolean): DeclKind {
  const node = unwrap(init);
  if (!node) return "const";
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression"
  )
    return jsx && isPascal(name) ? "component" : "function";
  if (node.type === "CallExpression") {
    const { root, direct } = callRoot(node);
    if (direct === "createTRPCRouter" || direct === "mergeRouters")
      return "router";
    if (direct === "pgTable") return "table";
    if (direct === "pgEnum") return "enum";
    if (root && /Procedure$/.test(root)) return "procedure";
    if (
      jsx &&
      isPascal(name) &&
      (direct === "memo" ||
        direct === "forwardRef" ||
        /^(React\.)?(memo|forwardRef)$/.test(root ?? ""))
    )
      return "component";
  }
  return "const";
}

function declsOf(
  stmt: Node,
  code: string,
  jsx: boolean,
  exported: boolean,
  isDefault: boolean,
): Decl[] {
  const base = {
    start: stmt.loc.start.line,
    end: stmt.loc.end.line,
    exported,
    isDefault,
  };
  const prefix = `${exported ? "export " : ""}${isDefault ? "default " : ""}`;
  const head = (n: Node, bodyStart: number) =>
    collapse(code.slice(n.start, bodyStart)).replace(/\s*\{$/, "");
  switch (stmt.type) {
    case "FunctionDeclaration": {
      const name = stmt.id?.name ?? "default";
      const sig = head(stmt, stmt.body.start);
      return [
        {
          ...base,
          name,
          kind: jsx && isPascal(name) ? "component" : "function",
          sig: clip(prefix + sig),
        },
      ];
    }
    case "ClassDeclaration": {
      const name = stmt.id?.name ?? "default";
      return [
        {
          ...base,
          name,
          kind: "class",
          sig: clip(prefix + head(stmt, stmt.body.start)),
        },
      ];
    }
    case "TSInterfaceDeclaration":
      return [
        {
          ...base,
          name: stmt.id.name,
          kind: "interface",
          sig: clip(prefix + head(stmt, stmt.body.start)),
        },
      ];
    case "TSTypeAliasDeclaration":
      return [
        {
          ...base,
          name: stmt.id.name,
          kind: "type",
          sig: clip(prefix + collapse(code.slice(stmt.start, stmt.end))),
        },
      ];
    case "TSEnumDeclaration":
      return [
        {
          ...base,
          name: stmt.id.name,
          kind: "enum",
          sig: clip(`${prefix}enum ${stmt.id.name}`),
        },
      ];
    case "VariableDeclaration":
      return stmt.declarations.flatMap((d: Node) => {
        if (d.id.type !== "Identifier") return [];
        const init = unwrap(d.init);
        const kind = kindOfInit(d.id.name, d.init, jsx);
        let sig: string;
        if (
          init &&
          (init.type === "ArrowFunctionExpression" ||
            init.type === "FunctionExpression") &&
          init.body
        ) {
          const end =
            init.body.type === "BlockStatement"
              ? init.body.start
              : init.body.start;
          sig = collapse(code.slice(d.start, end)).replace(/\s*\{$/, "");
        } else {
          sig = collapse(code.slice(d.start, d.end).split("\n")[0]);
        }
        return [
          {
            ...base,
            name: d.id.name,
            kind,
            sig: clip(`${prefix}${stmt.kind} ${sig}`),
          },
        ];
      });
    default:
      return [];
  }
}

const stringArg = (n: Node | undefined): string | null => {
  if (!n) return null;
  if (n.type === "StringLiteral") return n.value;
  if (n.type === "TemplateLiteral" && n.expressions.length === 0)
    return n.quasis[0].value.cooked;
  return null;
};

export function parseSource(
  code: string,
  file: string,
): Pick<FileInfo, "imports" | "decls" | "client" | "parseError"> {
  const ext = extname(file);
  let text = code;
  let startLine = 1;
  if (ext === ".astro") {
    const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(code);
    if (!match) return { imports: [], decls: [], client: false };
    text = match[1];
    startLine = 2;
  }
  const jsx = ext !== ".ts" && ext !== ".mts" && ext !== ".cts";
  let ast: Node;
  try {
    ast = parse(text, {
      sourceType: "module",
      startLine,
      errorRecovery: true,
      plugins: jsx ? ["typescript", "jsx"] : ["typescript"],
    }).program as unknown as Node;
  } catch (error) {
    return {
      imports: [],
      decls: [],
      client: false,
      parseError: (error as Error).message,
    };
  }

  const imports: ImportRec[] = [];
  const decls: Decl[] = [];
  const line = (n: Node) => n.loc.start.line;
  const body: Node[] = ast.body;
  const client = (ast.directives ?? []).some(
    (d: Node) => d.value?.value === "use client",
  );

  for (const stmt of body) {
    switch (stmt.type) {
      case "ImportDeclaration": {
        const specs: Node[] = stmt.specifiers;
        const names = specs.map((s) =>
          s.type === "ImportDefaultSpecifier"
            ? "default"
            : s.type === "ImportNamespaceSpecifier"
              ? "*"
              : (s.imported.name ?? s.imported.value),
        );
        const allType =
          stmt.importKind === "type" ||
          (specs.length > 0 && specs.every((s) => s.importKind === "type"));
        imports.push({
          spec: stmt.source.value,
          kind: allType
            ? "type"
            : specs.length === 0 && stmt.importKind !== "type"
              ? "side-effect"
              : "import",
          line: line(stmt),
          names,
        });
        break;
      }
      case "ExportAllDeclaration":
        imports.push({
          spec: stmt.source.value,
          kind: stmt.exportKind === "type" ? "type" : "reexport",
          line: line(stmt),
          names: ["*"],
        });
        break;
      case "ExportNamedDeclaration":
        if (stmt.source) {
          imports.push({
            spec: stmt.source.value,
            kind: stmt.exportKind === "type" ? "type" : "reexport",
            line: line(stmt),
            names: stmt.specifiers.map(
              (s: Node) => s.local?.name ?? s.local?.value ?? "*",
            ),
          });
        } else if (stmt.declaration)
          decls.push(...declsOf(stmt.declaration, text, jsx, true, false));
        break;
      case "ExportDefaultDeclaration": {
        const d = stmt.declaration as Node;
        if (["FunctionDeclaration", "ClassDeclaration"].includes(d.type)) {
          const made = declsOf(d, text, jsx, true, true);
          for (const item of made) {
            item.start = stmt.loc.start.line;
            item.end = stmt.loc.end.line;
          }
          decls.push(...made);
        } else if (d.type === "Identifier") {
          decls.push({
            name: d.name,
            kind: "const",
            exported: true,
            isDefault: true,
            start: line(stmt),
            end: line(stmt),
            sig: `export default ${d.name}`,
          });
        }
        break;
      }
      default:
        decls.push(...declsOf(stmt, text, jsx, false, false));
    }
  }
  // `export { a, b as c }` and `export default a` mark earlier declarations.
  for (const stmt of body) {
    if (
      stmt.type === "ExportNamedDeclaration" &&
      !stmt.source &&
      !stmt.declaration
    ) {
      for (const s of stmt.specifiers as Node[]) {
        const local = s.local?.name;
        const exportedName = s.exported?.name ?? s.exported?.value;
        const hit = decls.find((d) => d.name === local && !d.exported);
        if (hit) {
          hit.exported = true;
          if (exportedName !== local) hit.exportedAs = exportedName;
          if (exportedName === "default") hit.isDefault = true;
        }
      }
    }
    if (
      stmt.type === "ExportDefaultDeclaration" &&
      stmt.declaration.type === "Identifier"
    ) {
      const hit = decls.find(
        (d) => d.name === stmt.declaration.name && !d.exported,
      );
      if (hit) {
        hit.exported = true;
        hit.isDefault = true;
      }
    }
  }

  // import() and require() can sit anywhere, so look through the whole tree,
  // but only for the files whose text says they have one.
  if (!/\bimport\s*\(|\brequire\s*\(/.test(text)) {
    imports.sort((a, b) => a.line - b.line);
    return { imports, decls, client };
  }
  walkAst(ast, (n) => {
    if (n.type === "CallExpression" && n.callee.type === "Import") {
      const spec = stringArg(n.arguments[0]);
      if (spec)
        imports.push({ spec, kind: "dynamic", line: line(n), names: [] });
    } else if (n.type === "ImportExpression") {
      const spec = stringArg(n.source);
      if (spec)
        imports.push({ spec, kind: "dynamic", line: line(n), names: [] });
    } else if (
      n.type === "CallExpression" &&
      n.callee.type === "Identifier" &&
      n.callee.name === "require"
    ) {
      const spec = stringArg(n.arguments[0]);
      if (spec)
        imports.push({ spec, kind: "require", line: line(n), names: [] });
    } else if (n.type === "TSImportType") {
      const spec = stringArg(n.argument?.literal ?? n.argument);
      if (spec) imports.push({ spec, kind: "type", line: line(n), names: [] });
    }
  });
  imports.sort((a, b) => a.line - b.line);
  return { imports, decls, client };
}

// --- resolution --------------------------------------------------------

interface PackageInfo {
  name: string;
  path: string;
  exports: Record<string, unknown> | null;
  main: string | null;
}

interface PathAlias {
  prefix: string;
  suffix: string;
  star: boolean;
  targets: string[];
}

// oxlint-disable-next-line typescript/no-explicit-any
const readJson = (file: string): any => {
  try {
    const raw = readFileSync(file, "utf8");
    return JSON.parse(stripComments(raw).replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
};

function loadPackages(): {
  packages: PackageInfo[];
  aliases: Map<string, PathAlias[]>;
} {
  const packages: PackageInfo[] = [];
  const aliases = new Map<string, PathAlias[]>();
  for (const ws of workspaces()) {
    const pkg = readJson(join(ROOT, ws.path, "package.json")) ?? {};
    let exportsMap: Record<string, unknown> | null = null;
    if (typeof pkg.exports === "string") exportsMap = { ".": pkg.exports };
    else if (pkg.exports && typeof pkg.exports === "object")
      exportsMap = Object.keys(pkg.exports).some((k) => k.startsWith("."))
        ? pkg.exports
        : { ".": pkg.exports };
    packages.push({
      name: ws.name,
      path: ws.path,
      exports: exportsMap,
      main: pkg.main ?? null,
    });

    const options = readJson(
      join(ROOT, ws.path, "tsconfig.json"),
    )?.compilerOptions;
    if (options?.paths) {
      const baseDir = posix.normalize(
        posix.join(ws.path, options.baseUrl ?? "."),
      );
      const list: PathAlias[] = Object.entries<string[]>(options.paths).map(
        ([pattern, targets]) => {
          const star = pattern.includes("*");
          const [prefix, suffix = ""] = pattern.split("*");
          return {
            prefix,
            suffix,
            star,
            targets: targets.map((t) => posix.join(baseDir, t)),
          };
        },
      );
      aliases.set(ws.path, list);
    }
  }
  packages.sort((a, b) => b.name.length - a.name.length);
  return { packages, aliases };
}

function exportTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["import", "default", "types", "node", "require"]) {
      const found = key in record ? exportTarget(record[key]) : null;
      if (found) return found;
    }
    for (const entry of Object.values(record)) {
      const found = exportTarget(entry);
      if (found) return found;
    }
  }
  return null;
}

/** Node substitutes every `*` in an exports or paths target, not the first. */
export const fillPattern = (target: string, value: string) =>
  target.replaceAll("*", value);

const EXTERNAL_PREFIX = /^(node:|astro:|virtual:|https?:|data:)/;

function externalName(spec: string): string {
  if (EXTERNAL_PREFIX.test(spec)) return spec;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

class Resolver {
  files: Set<string>;
  packages: PackageInfo[];
  aliases: Map<string, PathAlias[]>;

  constructor(files: Set<string>) {
    this.files = files;
    ({ packages: this.packages, aliases: this.aliases } = loadPackages());
  }

  workspaceOf(file: string): string | null {
    const found = this.packages.find(
      (p) => file === p.path || file.startsWith(`${p.path}/`),
    );
    return found?.path ?? null;
  }

  // A repo-relative path with no extension, or with one, to a graph file.
  file(base: string): string | null {
    if (this.files.has(base)) return base;
    for (const ext of CODE_EXT)
      if (this.files.has(base + ext)) return base + ext;
    for (const ext of CODE_EXT)
      if (this.files.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
    // ESM TypeScript names the output extension: "./x.js" is x.ts on disk.
    const swapped = /\.(m?)js$/.exec(base);
    if (swapped) {
      const stem = base.slice(0, -swapped[0].length);
      for (const ext of [`.${swapped[1]}ts`, ".tsx"])
        if (this.files.has(stem + ext)) return stem + ext;
    }
    return null;
  }

  private asset(base: string): string | null {
    return extname(base) &&
      !CODE_EXT.includes(extname(base)) &&
      existsSync(resolve(ROOT, base))
      ? base
      : null;
  }

  private viaPackage(spec: string): Partial<Edge> | null {
    const pkg = this.packages.find(
      (p) => spec === p.name || spec.startsWith(`${p.name}/`),
    );
    if (!pkg) return null;
    const subpath = spec === pkg.name ? "." : `.${spec.slice(pkg.name.length)}`;
    let target: string | null = null;
    if (pkg.exports) {
      if (subpath in pkg.exports) target = exportTarget(pkg.exports[subpath]);
      else
        for (const [key, value] of Object.entries(pkg.exports)) {
          const star = key.indexOf("*");
          if (
            star === -1 ||
            !subpath.startsWith(key.slice(0, star)) ||
            !subpath.endsWith(key.slice(star + 1))
          )
            continue;
          const matched = subpath.slice(
            star,
            subpath.length - (key.length - star - 1),
          );
          const mapped = exportTarget(value);
          if (mapped) target = fillPattern(mapped, matched);
          break;
        }
    } else if (subpath === ".") target = pkg.main ?? "./src/index.ts";
    if (!target) return { unresolved: true };
    const base = posix.normalize(posix.join(pkg.path, target));
    const hit = this.file(base) ?? this.file(base.replace(/\/dist\//, "/src/"));
    return hit
      ? { to: hit }
      : this.asset(base)
        ? { asset: base }
        : { unresolved: true };
  }

  resolve(from: string, spec: string): Partial<Edge> {
    if (spec.startsWith(".")) {
      const base = posix.normalize(posix.join(posix.dirname(from), spec));
      const hit = this.file(base);
      if (hit) return { to: hit };
      const asset = this.asset(base);
      return asset ? { asset } : { unresolved: true };
    }
    const wsPath = this.workspaceOf(from);
    for (const alias of (wsPath && this.aliases.get(wsPath)) || []) {
      const matches = alias.star
        ? spec.startsWith(alias.prefix) &&
          spec.endsWith(alias.suffix) &&
          spec.length >= alias.prefix.length + alias.suffix.length
        : spec === alias.prefix;
      if (!matches) continue;
      const star = alias.star
        ? spec.slice(alias.prefix.length, spec.length - alias.suffix.length)
        : "";
      for (const target of alias.targets) {
        const base = posix.normalize(fillPattern(target, star));
        const hit = this.file(base);
        if (hit) return { to: hit };
        const asset = this.asset(base);
        if (asset) return { asset };
      }
    }
    if (!EXTERNAL_PREFIX.test(spec)) {
      const viaPackage = this.viaPackage(spec);
      if (viaPackage) return viaPackage;
    }
    return { external: externalName(spec) };
  }
}

// --- the cached graph --------------------------------------------------

const infos = new Map<string, FileInfo>();
let cached: { graph: Graph; signature: string } | null = null;

// Files git knows about or would add: tracked plus untracked, minus whatever
// .gitignore excludes, so generated files (next-env.d.ts, .next, .astro) are
// never indexed. Null when git is not available.
function listFilesWithGit(): string[] | null {
  const run = spawnSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...ROOTS,
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.error || run.status !== 0) return null;
  return (
    run.stdout
      .split("\0")
      .filter(
        (name) =>
          name &&
          CODE_EXT.includes(extname(name)) &&
          !name
            .split("/")
            .slice(0, -1)
            .some((dir) => SKIP_DIRS.has(dir)),
      )
      .map((name) => resolve(ROOT, name))
      // A tracked file deleted from the working tree is still listed.
      .filter((file) => existsSync(file))
  );
}

function listFiles(): string[] {
  const viaGit = listFilesWithGit();
  if (viaGit) return viaGit;
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(join(dir, entry.name));
      } else if (CODE_EXT.includes(extname(entry.name)))
        out.push(join(dir, entry.name));
    }
  };
  for (const top of ROOTS)
    if (existsSync(resolve(ROOT, top))) visit(resolve(ROOT, top));
  return out;
}

// Resolution reads these, so a change to any of them rebuilds the edges. The
// list comes from the workspace scan, which runs only when the graph rebuilds.
let configFiles: string[] | null = null;
function configSignature(refresh: boolean): string {
  if (refresh || !configFiles)
    configFiles = [
      "pnpm-workspace.yaml",
      ...workspaces().flatMap((ws) => [
        `${ws.path}/package.json`,
        `${ws.path}/tsconfig.json`,
      ]),
    ];
  return configFiles
    .map((file) => {
      try {
        return `${file}:${statSync(resolve(ROOT, file)).mtimeMs}`;
      } catch {
        return `${file}:-`;
      }
    })
    .join("|");
}

export function getGraph(): Graph {
  const started = performance.now();
  const abs = listFiles();
  const seen = new Set<string>();
  let changed = false;
  for (const file of abs) {
    const key = rel(file);
    seen.add(key);
    const prior = infos.get(key);
    const stamped = readIfChanged(file, prior);
    if (!stamped) continue;
    changed = true;
    infos.set(key, {
      file: key,
      mtime: stamped.mtime,
      size: stamped.size,
      ...parseSource(stamped.text, file),
    });
  }
  for (const key of [...infos.keys()])
    if (!seen.has(key)) {
      infos.delete(key);
      changed = true;
    }
  if (cached && !changed && cached.signature === configSignature(false))
    return cached.graph;
  const signature = configSignature(true);

  const resolver = new Resolver(seen);
  const out = new Map<string, Edge[]>();
  const inn = new Map<string, Edge[]>();
  for (const info of infos.values()) {
    const edges: Edge[] = info.imports.map((imp) => ({
      from: info.file,
      spec: imp.spec,
      kind: imp.kind,
      line: imp.line,
      names: imp.names,
      ...resolver.resolve(info.file, imp.spec),
    }));
    out.set(info.file, edges);
    for (const edge of edges)
      if (edge.to) {
        const list = inn.get(edge.to) ?? [];
        list.push(edge);
        inn.set(edge.to, list);
      }
  }
  const graph: Graph = {
    files: infos,
    out,
    inn,
    builtMs: Math.round(performance.now() - started),
  };
  cached = { graph, signature };
  return graph;
}
