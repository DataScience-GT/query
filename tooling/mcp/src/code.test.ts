import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { codeDeps, codeImpact, codeOutline, codeSymbol } from "./code.ts";
import { getGraph, parseSource } from "./graph.ts";
import { ROOT } from "./source.ts";

// The first graph build parses every file, and the full suite runs this beside
// a hundred other files.
vi.setConfig({ testTimeout: 60_000 });

const parse = (code: string, file = "x.ts") => parseSource(code, file);

describe("parser edge cases", () => {
  it("tells type-only imports from value imports", () => {
    const { imports } = parse(`
      import type { A } from "./a";
      import { type B, type C } from "./b";
      import { D, type E } from "./c";
      import "./side";
    `);
    expect(imports.map((i) => [i.spec, i.kind])).toEqual([
      ["./a", "type"],
      ["./b", "type"],
      ["./c", "import"],
      ["./side", "side-effect"],
    ]);
  });

  it("reads multiline imports with their line", () => {
    const { imports } = parse(
      `const x = 1;\nimport {\n  a,\n  b as c,\n} from "./m";`,
    );
    expect(imports).toEqual([
      { spec: "./m", kind: "import", line: 2, names: ["a", "b"] },
    ]);
  });

  it("reads re-exports, export-star and mixed type re-exports", () => {
    const { imports } = parse(`
      export * from "./all";
      export { a, type B } from "./some";
      export type { T } from "./types";
    `);
    expect(imports.map((i) => [i.spec, i.kind])).toEqual([
      ["./all", "reexport"],
      ["./some", "reexport"],
      ["./types", "type"],
    ]);
  });

  it("finds import(), require() and import() types anywhere in the file", () => {
    const { imports } = parse(`
      const Lazy = dynamic(() => import("./lazy"));
      async function f() { return (await import(\`./tpl\`)).x; }
      const r = require("./cjs");
      type T = typeof import("./only-type");
      const skipped = import(variable);
    `);
    expect(imports.map((i) => [i.spec, i.kind])).toEqual([
      ["./lazy", "dynamic"],
      ["./tpl", "dynamic"],
      ["./cjs", "require"],
      ["./only-type", "type"],
    ]);
  });

  it("does not take an import written inside a string or comment", () => {
    expect(
      parse(`// import "./a"\nconst s = 'import "./b"';\n/* import("./c") */`)
        .imports,
    ).toEqual([]);
  });

  it("detects the use client directive only when it leads", () => {
    expect(parse(`"use client";\nimport x from "y";`, "a.tsx").client).toBe(
      true,
    );
    expect(
      parse(`// note\n'use client'\nexport const a = 1;`, "a.tsx").client,
    ).toBe(true);
    expect(parse(`import x from "y";\n"use client";`, "a.tsx").client).toBe(
      false,
    );
  });

  it("outlines declarations with kind, range and signature", () => {
    const { decls } = parse(
      `
export function plain(a: number, b = 2): string {
  return "";
}
export const Card = ({ title }: Props) => <div>{title}</div>;
const local = 1;
export type Pair<T> = [T, T];
export interface Shape extends Base { w: number }
export const appRouter = createTRPCRouter({ a: 1 });
export const isAdmin = protectedProcedure.use(async () => {});
export default function Page() { return null; }
const hidden = 1;
export { hidden as shown };
`,
      "x.tsx",
    );
    const by = (name: string) => decls.find((d) => d.name === name);
    expect(by("plain")).toMatchObject({
      kind: "function",
      exported: true,
      start: 2,
      end: 4,
    });
    expect(by("plain")?.sig).toBe(
      "export function plain(a: number, b = 2): string",
    );
    expect(by("Card")).toMatchObject({ kind: "component", exported: true });
    expect(by("local")).toMatchObject({ kind: "const", exported: false });
    expect(by("Pair")?.kind).toBe("type");
    expect(by("Shape")?.sig).toBe("export interface Shape extends Base");
    expect(by("appRouter")?.kind).toBe("router");
    expect(by("isAdmin")?.kind).toBe("procedure");
    expect(by("Page")).toMatchObject({
      kind: "component",
      isDefault: true,
      exported: true,
    });
    expect(by("hidden")).toMatchObject({ exported: true, exportedAs: "shown" });
  });

  it("reads the frontmatter of an .astro file with real line numbers", () => {
    const { imports } = parse(
      `---\nimport A from "./A.astro";\n---\n<A />`,
      "p.astro",
    );
    expect(imports).toEqual([
      { spec: "./A.astro", kind: "import", line: 2, names: ["default"] },
    ]);
  });
});

describe("graph over this repo", () => {
  const graph = getGraph();

  it("covers sites, packages and tooling and skips build output", () => {
    const files = [...graph.files.keys()];
    expect(files).toContain("sites/mainweb/lib/trpc.tsx");
    expect(files).toContain("packages/api/src/root.ts");
    expect(files).toContain("tooling/mcp/src/graph.ts");
    expect(
      files.some(
        (f) =>
          f.includes("node_modules") ||
          f.includes("/.next/") ||
          f.includes("graphify-out"),
      ),
    ).toBe(false);
    expect([...graph.files.values()].filter((f) => f.parseError)).toEqual([]);
  });

  it("resolves @/ aliases through the mainweb tsconfig", () => {
    const edge = graph.out
      .get("sites/mainweb/app/(auth)/layout.tsx")
      ?.find((e) => e.spec === "@/components/portal/AppThemeProvider");
    expect(edge?.to).toBe(
      "sites/mainweb/components/portal/AppThemeProvider.tsx",
    );
  });

  it("resolves workspace package names through package.json exports", () => {
    const edges = graph.out.get("packages/api/src/routers/admin.ts") ?? [];
    expect(edges.find((e) => e.spec === "@query/db/constants")?.to).toBe(
      "packages/db/src/constants/index.ts",
    );
    const trpc = graph.out.get("sites/mainweb/lib/trpc.tsx") ?? [];
    expect(trpc.find((e) => e.spec === "@query/api")).toMatchObject({
      to: "packages/api/src/index.ts",
      kind: "type",
    });
    expect(trpc.find((e) => e.spec === "@trpc/react-query")).toMatchObject({
      external: "@trpc/react-query",
    });
  });

  it("resolves relative paths, extensions, index files and astro components", () => {
    expect(
      graph.out
        .get("packages/api/src/root.ts")
        ?.find((e) => e.spec === "./routers/user")?.to,
    ).toBe("packages/api/src/routers/user.ts");
    expect(
      graph.out
        .get("packages/api/src/routers/hackathon/index.ts")
        ?.find((e) => e.spec === "./crud")?.to,
    ).toBe("packages/api/src/routers/hackathon/crud.ts");
    expect(
      graph.out
        .get("tooling/mcp/src/server.ts")
        ?.find((e) => e.spec === "./api.ts")?.to,
    ).toBe("tooling/mcp/src/api.ts");
    const astro =
      graph.out.get("sites/hacklytics2027/src/components/Hero.astro") ?? [];
    expect(astro.find((e) => e.spec.endsWith("MlhBadge.astro"))?.to).toMatch(
      /packages\/event-kit\/.*MlhBadge\.astro$/,
    );
  });

  it("leaves no import unresolved", () => {
    const broken = [...graph.out.values()].flat().filter((e) => e.unresolved);
    expect(broken.map((e) => `${e.from} -> ${e.spec}`)).toEqual([]);
  });

  it("serves a repeat call from the cache", () => {
    expect(getGraph()).toBe(graph);
  });

  it("notices a new file and its removal by mtime and listing", () => {
    const probe = resolve(ROOT, "tooling/mcp/src/probe-for-test.ts");
    try {
      writeFileSync(probe, "export const probeSymbolForTest = 1;\n");
      expect(codeSymbol("probeSymbolForTest")).toContain(
        "tooling/mcp/src/probe-for-test.ts:1",
      );
      // An edit that changes the file is read again.
      writeFileSync(probe, "export const probeRenamedForTest = 22222;\n");
      expect(codeSymbol("probeSymbolForTest")).toContain("No symbol");
      expect(codeSymbol("probeRenamedForTest")).toContain(
        "tooling/mcp/src/probe-for-test.ts:1",
      );
    } finally {
      rmSync(probe, { force: true });
    }
    expect(codeSymbol("probeSymbolForTest")).toContain("No symbol");
  });
});

describe("code_symbol", () => {
  it("finds a router, a component and a procedure kind with file:line", () => {
    expect(codeSymbol("userRouter")).toMatch(
      /^packages\/api\/src\/routers\/user\.ts:\d+ {2}router {2}export const userRouter = createTRPCRouter/,
    );
    expect(codeSymbol("AppThemeProvider")).toMatch(
      /components\/portal\/AppThemeProvider\.tsx:\d+ {2}component/,
    );
    expect(codeSymbol("isAdmin")).toMatch(
      /middleware\/procedures\.ts:\d+ {2}procedure/,
    );
  });

  it("ranks an exact name ahead of longer names that contain it", () => {
    const first = codeSymbol("trpc").split("\n")[0];
    expect(first).toMatch(
      /^sites\/mainweb\/lib\/trpc\.tsx:6 {2}const {2}export const trpc = /,
    );
  });

  it("matches by prefix and caps long results", () => {
    expect(codeSymbol("protectedProc")).toContain("protectedProcedure");
    const many = codeSymbol("e");
    expect(many).toMatch(/truncated, \d+ more$/);
    expect(many.split("\n").length).toBeLessThanOrEqual(26);
  });
});

describe("code_outline", () => {
  it("shows imports and declarations of a known file, not its body", () => {
    const out = codeOutline("sites/mainweb/lib/trpc.tsx");
    expect(out).toContain("[client]");
    expect(out).toContain(
      "type @query/api {AppRouter} -> packages/api/src/index.ts",
    );
    expect(out).toContain("external: @trpc/react-query");
    expect(out).toMatch(
      /L6 const {2}export const trpc = createTRPCReact<AppRouter>\(\)/,
    );
  });

  it("accepts a unique path suffix and rejects outside paths", () => {
    expect(codeOutline("lib/trpc.tsx")).toContain("sites/mainweb/lib/trpc.tsx");
    expect(() => codeOutline("../package.json")).toThrow(
      /outside the repository/,
    );
    expect(() => codeOutline("sites/mainweb/nope.ts")).toThrow(
      /Not in the code graph/,
    );
  });
});

describe("code_deps", () => {
  it("lists importers of the tRPC client hook", () => {
    const out = codeDeps("sites/mainweb/lib/trpc.tsx", "importers", 1);
    expect(out).toContain("<- sites/mainweb/app/(portal)/admin/AdminPage.tsx");
  });

  it("walks imports to depth 2 and marks types, dynamics, repeats and externals", () => {
    const out = codeDeps(
      "sites/mainweb/app/(portal)/dashboard/DashboardPage.tsx",
      "imports",
      2,
    );
    expect(out).toContain(
      "-> sites/mainweb/components/portal/LinkStripeAccount.tsx",
    );
    expect(out).toContain("[dynamic]");
    expect(out).toContain("[type-only]");
    expect(out).toContain("(seen)");
    expect(out).toMatch(/external: .*react/);
  });

  it("follows a barrel re-export to the file behind it", () => {
    const out = codeDeps("packages/api/src/index.ts", "imports", 1);
    expect(out).toContain("-> packages/api/src/root.ts  [reexport]");
  });
});

describe("code_impact", () => {
  it("reaches the portal pages that use a portal component, with client flags", () => {
    const out = codeImpact("sites/mainweb/components/portal/EventCheckIn.tsx");
    expect(out).toContain(
      "/checkin  (portal)  page [server] sites/mainweb/app/(portal)/checkin/page.tsx",
    );
    expect(out).toContain("web: ");
  });

  it("reaches client route files and groups by workspace from a package file", () => {
    const out = codeImpact("sites/mainweb/lib/trpc.tsx");
    expect(out).toMatch(
      /\/admin\/hackathons\/\[id\]\/events\/\[eventId\]\/code {2}\(portal\) {2}page \[client\]/,
    );
    const fromApi = codeImpact("packages/api/src/services/pricing.ts");
    expect(fromApi).toMatch(/by workspace: .*@query\/api \d+/);
    expect(fromApi).toMatch(/by workspace: .*web \d+/);
  });

  it("accepts an exported symbol name and says it is file-level", () => {
    const out = codeImpact("AppThemeProvider");
    expect(out).toContain(
      "symbol AppThemeProvider, declared in sites/mainweb/components/portal/AppThemeProvider.tsx",
    );
    expect(out).toContain("(auth)");
  });

  it("reaches routes through a layout", () => {
    expect(
      codeImpact("sites/mainweb/components/portal/AppThemeProvider.tsx"),
    ).toContain("via layout");
  });
});
