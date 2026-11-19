import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { procedures } from "./api.ts";
import { checkArgs, dbRefusal } from "./check.ts";
import { dbSchema, tables } from "./db.ts";
import { docsRead, docsSearch } from "./docs.ts";
import { isClientFile, routes } from "./routes.ts";
import { findClose, parseChain, ROOT, splitTop, walk } from "./source.ts";
import { workspaces } from "./workspace.ts";

// The readers scan the whole repo; give them room when the suite is busy.
vi.setConfig({ testTimeout: 30_000 });

// These run the real readers against this repo, so each asserts on something
// that exists today. If one fails after a refactor, the reader and the repo
// disagree: fix whichever is wrong.

describe("scanner", () => {
  it("splits on top-level commas only, through strings and regexes", () => {
    const pieces = splitTop(
      'a: f(1, 2), b: "x, y", c: /[,\']/.test(z), d: `${1 + 2},`',
    );
    expect(pieces.map((p) => p.text.split(":")[0])).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("matches brackets past an apostrophe inside a regex literal", () => {
    const text = `x(/[a']/, ")")`;
    expect(findClose(text, 1)).toBe(text.length - 1);
  });

  it("reads a call chain", () => {
    const chain = parseChain(
      "isAdmin.input(z.object({})).use(audit).mutation(async () => 1)",
    );
    expect(chain.head).toBe("isAdmin");
    expect(chain.calls.map((c) => c.name)).toEqual([
      "input",
      "use",
      "mutation",
    ]);
  });
});

describe("workspace", () => {
  it("lists packages with internal dependencies in both directions", () => {
    const all = workspaces();
    const api = all.find((ws) => ws.name === "@query/api");
    expect(api?.path).toBe("packages/api");
    expect(api?.dependsOn).toContain("@query/db");
    const db = all.find((ws) => ws.name === "@query/db");
    expect(db?.dependedOnBy).toContain("@query/api");
    expect(all.map((ws) => ws.path)).toContain("tooling/mcp");
  });
});

describe("docs", () => {
  it("finds the contributing guide and reads it", () => {
    expect(docsSearch("branching dev main")).toContain("docs/contributing.md");
    expect(docsRead("docs/contributing.md")).toContain("# Contributing");
  });

  it("rejects paths outside the repo and files outside the docs set", () => {
    expect(() => docsRead("../package.json")).toThrow(/outside the repository/);
    expect(() => docsRead("docs/../../etc/passwd")).toThrow(
      /outside the repository/,
    );
    expect(() => docsRead("C:\\Windows\\win.ini")).toThrow(
      /outside the repository/,
    );
    expect(() => docsRead("package.json")).toThrow(/Not a documentation file/);
  });
});

describe("api_procedures", () => {
  const all = procedures();
  const find = (path: string) => all.find((p) => p.path === path);

  it("follows the root router into nested and merged routers", () => {
    expect(find("user.me")).toMatchObject({
      type: "query",
      kind: ["protectedProcedure"],
      file: "packages/api/src/routers/user.ts",
    });
    // hackathon is mergeRouters(...), and its admin part spreads *Procedures objects
    expect(find("hackathon.list")?.kind[0]).toBe("publicProcedure");
    expect(all.some((p) => p.path.startsWith("judging.admin."))).toBe(true);
  });

  it("reports the role middleware a procedure is built on", () => {
    expect(find("admin.list")).toMatchObject({
      type: "query",
      kind: ["isAdmin", "protectedProcedure"],
    });
    expect(find("admin.create")?.type).toBe("mutation");
    expect(find("user.updateProfileImage")?.kind[0]).toBe("uploadProcedure");
  });

  it("gives a file and a line that holds the procedure name", () => {
    const p = find("member.rotatePass");
    expect(p).toBeDefined();
    const line = readFileSync(`${ROOT}/${p?.file}`, "utf8").split("\n")[
      (p?.line ?? 1) - 1
    ];
    expect(line).toContain("rotatePass");
  });

  it("finds as many procedures as there are .query/.mutation terminators", () => {
    // Guards the regex-literal and spread handling: a router that stops
    // parsing halfway silently drops everything after it.
    let expected = 0;
    const files = walk(
      `${ROOT}/packages/api/src/routers`,
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    for (const file of files)
      expected += (
        readFileSync(file, "utf8").match(/\.(query|mutation)\(/g) ?? []
      ).length;
    expect(all.length).toBe(expected);
  });
});

describe("db_schema", () => {
  it("parses a table's columns", () => {
    const admins = tables().find((t) => t.variable === "admins");
    expect(admins?.name).toBe("admin");
    const role = admins?.columns.find((c) => c.key === "role");
    expect(role).toMatchObject({
      name: "role",
      nullable: false,
      default: 'default("admin")',
    });
    const userId = admins?.columns.find((c) => c.key === "userId");
    expect(userId).toMatchObject({
      name: "user_id",
      unique: true,
      references: "users.id",
    });
    expect(admins?.columns.find((c) => c.key === "expiresAt")?.nullable).toBe(
      true,
    );
  });

  it("finds a table by its SQL name and reports every declared table", () => {
    expect(dbSchema("admin")).toContain("userId (user_id)");
    expect(tables().length).toBeGreaterThanOrEqual(60);
    expect(() => dbSchema("nope_table")).toThrow(/No table/);
  });
});

describe("routes", () => {
  const all = routes();
  const find = (url: string) => all.find((r) => r.url === url);

  it("puts portal and auth pages in their route groups", () => {
    expect(find("/dashboard")?.group).toBe("(portal)");
    expect(find("/login")?.group).toBe("(auth)");
    expect(find("/")?.group).toBe("(none)");
  });

  it("reports route handlers with their methods and dynamic segments", () => {
    const trpc = find("/api/trpc/[trpc]")?.files[0];
    expect(trpc?.kind).toBe("route");
    expect(trpc?.methods).toEqual(["GET", "POST"]);
    expect(find("/hackathons/[id]")).toBeDefined();
  });

  it("tells client pages from server pages", () => {
    expect(
      find("/dashboard")?.files.find((f) => f.kind === "page")?.client,
    ).toBe(false);
    expect(
      all.some((r) => r.files.some((f) => f.kind === "page" && f.client)),
    ).toBe(true);
    expect(isClientFile('// c\n/* d */\n"use client";\nimport x')).toBe(true);
    expect(isClientFile('import x\n"use client"')).toBe(false);
  });
});

describe("run_check", () => {
  it("accepts only the four tasks and real workspace names", () => {
    expect(checkArgs("lint", "@query/api")).toEqual([
      "turbo",
      "run",
      "lint",
      "--filter=@query/api",
    ]);
    expect(() => checkArgs("deploy")).toThrow(/Unknown task/);
    expect(() => checkArgs("lint", "web && calc")).toThrow(/Unknown workspace/);
  });

  it("refuses test and build against a remote database, allows local or unset", () => {
    const neon = {
      DATABASE_URL: "postgres://u:p@ep-x.us-east-2.aws.neon.tech/db",
    };
    expect(dbRefusal("test", neon)).toMatch(/neon\.tech/);
    expect(
      dbRefusal("build", {
        TEST_DATABASE_URL: "postgres://u:p@db.example.com/x",
      }),
    ).toMatch(/not a local/);
    expect(dbRefusal("test", { DATABASE_URL: "not a url" })).toMatch(
      /unparseable/,
    );
    expect(
      dbRefusal("test", { DATABASE_URL: "postgres://u:p@localhost:5432/pgx" }),
    ).toBeNull();
    expect(
      dbRefusal("test", { DATABASE_URL: "postgres://u:p@[::1]:5432/pgx" }),
    ).toBeNull();
    expect(dbRefusal("test", {})).toBeNull();
    expect(dbRefusal("lint", neon)).toBeNull();
  });
});
