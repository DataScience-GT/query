// CI installs with Bun, but pnpm-lock.yaml stays the one source of truth:
// Firebase App Hosting builds with pnpm from that file. Bun migrates the
// lockfile in memory (`bun install --frozen-lockfile`), and this check proves
// what it put in node_modules is what pnpm would have installed here. Run it
// with Bun, right after the install: `bun tooling/scripts/src/install-parity.ts`.
//
// Compared, on the host's os, cpu and libc:
//   packages  every name@version pnpm would install, transitive included
//   edges     which version each package, and each workspace, links for each
//             dependency (peer variants collapsed to name@version)
//   patches   each patchedDependencies entry applies to what is installed
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

declare const Bun: { YAML: { parse(text: string): unknown } };

export interface Host {
  os: string;
  cpu: string;
  libc: string;
}

export interface Graph {
  packages: Set<string>;
  edges: Set<string>;
}

interface PackageEntry {
  os?: string[];
  cpu?: string[];
  libc?: string[];
}

interface Snapshot {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface ImporterDep {
  version: string;
}

export interface Lock {
  lockfileVersion: string;
  patchedDependencies?: Record<string, string>;
  importers: Record<
    string,
    Record<string, Record<string, ImporterDep> | undefined>
  >;
  packages: Record<string, PackageEntry>;
  snapshots: Record<string, Snapshot>;
}

const fwd = (path: string) => path.split("\\").join("/");
const withoutPeers = (ref: string) => ref.replace(/\(.*$/, "");

function listAllows(list: string[] | undefined, value: string) {
  if (!list || list.length === 0) return true;
  const denied = list
    .filter((item) => item.startsWith("!"))
    .map((item) => item.slice(1));
  return denied.length > 0 ? !denied.includes(value) : list.includes(value);
}

function fitsHost(entry: PackageEntry, host: Host) {
  return (
    listAllows(entry.os, host.os) &&
    listAllows(entry.cpu, host.cpu) &&
    listAllows(entry.libc, host.libc)
  );
}

// A snapshot dependency is a bare version, or `real-name@version` for an
// npm: alias. Anything else (link:, git, tarball) is refused rather than
// guessed at, so a new kind of dependency fails the check instead of slipping
// past it.
function resolveRef(alias: string, ref: string) {
  const bare = withoutPeers(ref);
  if (/^\d/.test(bare)) return `${alias}@${bare}`;
  const at = bare.indexOf("@", 1);
  if (at > 0 && /^\d/.test(bare.slice(at + 1))) return bare;
  throw new Error(
    `pnpm-lock.yaml: unsupported dependency ref "${alias}": "${ref}"`,
  );
}

/** What pnpm would install on `host`, read from the lockfile alone. */
export function expectedGraph(lock: Lock, host: Host): Graph {
  if (lock.lockfileVersion !== "9.0") {
    throw new Error(
      `pnpm-lock.yaml: lockfileVersion ${lock.lockfileVersion} is not 9.0, update this check`,
    );
  }
  // One package has a snapshot per peer variant. Collapsed to name@version,
  // the links of every variant count.
  const snapshots = new Map<string, Snapshot[]>();
  for (const [key, snapshot] of Object.entries(lock.snapshots)) {
    const id = withoutPeers(key);
    snapshots.set(id, [...(snapshots.get(id) ?? []), snapshot]);
  }

  const packages = new Set<string>();
  const edges = new Set<string>();
  const queue: string[] = [];
  const visit = (id: string) => {
    const entry = lock.packages[id];
    if (!entry) throw new Error(`pnpm-lock.yaml: ${id} has no packages entry`);
    if (!fitsHost(entry, host) || packages.has(id)) return false;
    packages.add(id);
    queue.push(id);
    return true;
  };

  for (const [importer, sections] of Object.entries(lock.importers)) {
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      for (const [name, dep] of Object.entries(sections[section] ?? {})) {
        const version = withoutPeers(dep.version);
        if (version.startsWith("link:")) {
          edges.add(
            `importer:${importer} -> ${name} => link:${fwd(join(importer, version.slice(5)))}`,
          );
          continue;
        }
        const id = `${name}@${version}`;
        const entry = lock.packages[id];
        if (!entry)
          throw new Error(`pnpm-lock.yaml: ${id} has no packages entry`);
        if (!fitsHost(entry, host)) continue;
        visit(id);
        edges.add(`importer:${importer} -> ${name} => ${id}`);
      }
    }
  }

  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const variants = snapshots.get(id);
    if (!variants)
      throw new Error(`pnpm-lock.yaml: ${id} has no snapshots entry`);
    for (const snapshot of variants) {
      for (const section of ["dependencies", "optionalDependencies"] as const) {
        for (const [alias, ref] of Object.entries(snapshot[section] ?? {})) {
          const target = resolveRef(alias, ref);
          const entry = lock.packages[target];
          if (!entry)
            throw new Error(`pnpm-lock.yaml: ${target} has no packages entry`);
          if (!fitsHost(entry, host)) continue;
          visit(target);
          edges.add(`${id} -> ${alias} => ${target}`);
        }
      }
    }
  }
  return { packages, edges };
}

/**
 * What differs. Bun also links a workspace's declared peerDependencies into
 * that workspace's node_modules (pnpm runs with autoInstallPeers: false and
 * does not); `isPeerLink` forgives exactly those extra links, and they still
 * have to point at a package the lockfile has.
 */
export function compareGraphs(
  expected: Graph,
  actual: Graph,
  isPeerLink: (importer: string, dependency: string) => boolean,
) {
  const only = (a: Set<string>, b: Set<string>) =>
    [...a].filter((item) => !b.has(item)).sort();
  const problems: string[] = [];
  for (const id of only(expected.packages, actual.packages))
    problems.push(`not installed by Bun: ${id}`);
  for (const id of only(actual.packages, expected.packages))
    problems.push(`not in pnpm-lock.yaml: ${id}`);
  for (const edge of only(expected.edges, actual.edges))
    problems.push(`link pnpm has, Bun lacks: ${edge}`);
  for (const edge of only(actual.edges, expected.edges)) {
    const [, importer, dependency] =
      /^importer:(.+?) -> (.+?) => /.exec(edge) ?? [];
    if (importer && dependency && isPeerLink(importer, dependency)) continue;
    problems.push(`link Bun has, pnpm lacks: ${edge}`);
  }
  return problems;
}

function listPackageDirs(dir: string) {
  const names: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    if (name.startsWith("@")) {
      for (const scoped of readdirSync(join(dir, name)))
        names.push(`${name}/${scoped}`);
    } else {
      names.push(name);
    }
  }
  return names;
}

function packageId(dir: string) {
  const manifest = JSON.parse(
    readFileSync(join(dir, "package.json"), "utf8"),
  ) as {
    name: string;
    version: string;
  };
  return `${manifest.name}@${manifest.version}`;
}

/** What Bun's isolated linker put on disk: node_modules/.bun/<entry>/node_modules/<package>. */
export function installedGraph(root: string, importers: string[]) {
  const store = join(root, "node_modules", ".bun");
  const packages = new Set<string>();
  const edges = new Set<string>();
  const dirs = new Map<string, string>();
  for (const entry of readdirSync(store)) {
    if (entry === "node_modules") continue;
    const modules = join(store, entry, "node_modules");
    const names = listPackageDirs(modules);
    const [own, ...extra] = names.filter(
      (name) => !lstatSync(join(modules, name)).isSymbolicLink(),
    );
    if (own === undefined || extra.length > 0) {
      throw new Error(
        `node_modules/.bun/${entry}: expected one package, found ${extra.length + (own === undefined ? 0 : 1)}`,
      );
    }
    const id = packageId(join(modules, own));
    packages.add(id);
    dirs.set(id, join(modules, own));
    for (const name of names) {
      if (name !== own)
        edges.add(`${id} -> ${name} => ${packageId(join(modules, name))}`);
    }
  }
  const realRoot = fwd(realpathSync(root));
  for (const importer of importers) {
    const modules = join(root, importer, "node_modules");
    if (!existsSync(modules)) continue;
    for (const name of listPackageDirs(modules)) {
      const real = fwd(realpathSync(join(modules, name)));
      const relativeReal = fwd(relative(realRoot, real));
      const target = relativeReal.startsWith("node_modules/.bun/")
        ? packageId(real)
        : `link:${relativeReal}`;
      edges.add(`importer:${importer} -> ${name} => ${target}`);
    }
  }
  return { graph: { packages, edges }, dirs };
}

function hostPlatform(): Host {
  const libc =
    process.platform === "linux" &&
    readdirSync("/lib").some((name) => name.startsWith("ld-musl-"))
      ? "musl"
      : "glibc";
  return { os: process.platform, cpu: process.arch, libc };
}

// A patch is applied exactly when it reverses cleanly. Inside this repo's work
// tree git resolves patch paths from the repo root and, finding nothing there,
// exits 0 without checking, so the ceiling hides the repo from git.
function unappliedPatches(
  root: string,
  patches: Record<string, string>,
  dirs: Map<string, string>,
) {
  const problems: string[] = [];
  for (const [id, patchPath] of Object.entries(patches)) {
    const dir = dirs.get(id);
    if (!dir) {
      problems.push(`patch ${patchPath}: ${id} is not installed`);
      continue;
    }
    try {
      execFileSync(
        "git",
        ["apply", "--reverse", "--check", resolve(root, patchPath)],
        {
          cwd: dir,
          env: { ...process.env, GIT_CEILING_DIRECTORIES: fwd(dirname(dir)) },
          stdio: "pipe",
        },
      );
    } catch {
      problems.push(`patch ${patchPath} is not applied to ${id}`);
    }
  }
  return problems;
}

function main(root: string) {
  const parsed = Bun.YAML.parse(
    readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
  );
  // pnpm 11+ writes two documents: its own version first, the project second.
  const lock = (Array.isArray(parsed) ? parsed.at(-1) : parsed) as Lock;
  const workspace = Bun.YAML.parse(
    readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
  ) as {
    patchedDependencies?: Record<string, string>;
  };

  const importers = Object.keys(lock.importers);
  const peers = new Map<string, Set<string>>();
  for (const importer of importers) {
    const manifest = JSON.parse(
      readFileSync(join(root, importer, "package.json"), "utf8"),
    ) as {
      peerDependencies?: Record<string, string>;
    };
    peers.set(importer, new Set(Object.keys(manifest.peerDependencies ?? {})));
  }

  const patches = workspace.patchedDependencies ?? {};
  const host = hostPlatform();
  const expected = expectedGraph(lock, host);
  const { graph, dirs } = installedGraph(root, importers);
  const problems = [
    ...compareGraphs(
      expected,
      graph,
      (importer, dep) => peers.get(importer)?.has(dep) ?? false,
    ),
    ...Object.keys(lock.patchedDependencies ?? {})
      .filter((id) => !(id in patches))
      .map(
        (id) =>
          `pnpm-lock.yaml patches ${id}, pnpm-workspace.yaml names no patch file for it`,
      ),
    ...unappliedPatches(root, patches, dirs),
  ];

  const summary = `${expected.packages.size} packages, ${expected.edges.size} links, ${Object.keys(patches).length} patches, ${host.os}/${host.cpu}/${host.libc}`;
  if (problems.length > 0) {
    console.error(`Bun's install differs from pnpm-lock.yaml (${summary}):`);
    for (const problem of problems.slice(0, 60)) console.error(`  ${problem}`);
    if (problems.length > 60)
      console.error(`  ... and ${problems.length - 60} more`);
    process.exit(1);
  }
  console.log(`Bun's install matches pnpm-lock.yaml (${summary}).`);
}

if (import.meta.main) main(resolve(process.argv[2] ?? process.cwd()));
