import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The first code-graph call in the server parses every file.
vi.setConfig({ testTimeout: 60_000 });

const server = fileURLToPath(new URL("./server.ts", import.meta.url));

let client: Client;

beforeAll(async () => {
  client = new Client({ name: "query-mcp-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [server],
      // A neutral environment: this test must not see or need a database.
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
      },
      stderr: "pipe",
    }),
  );
}, 30_000);

afterAll(async () => {
  await client?.close();
});

const text = (result: unknown) =>
  (result as { content: { text: string }[] }).content[0].text;

describe("query MCP server over stdio", () => {
  it("lists every tool", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "api_procedures",
      "code_deps",
      "code_impact",
      "code_outline",
      "code_symbol",
      "conventions",
      "db_schema",
      "docs_read",
      "docs_search",
      "routes",
      "run_check",
      "workspace",
    ]);
  });

  it("answers workspace", async () => {
    const out = text(
      await client.callTool({ name: "workspace", arguments: {} }),
    );
    expect(out).toContain("@query/api  packages/api");
    expect(out).toContain("@query/mcp  tooling/mcp");
  });

  it("answers api_procedures, whole and filtered", async () => {
    const some = text(
      await client.callTool({
        name: "api_procedures",
        arguments: { router: "admin" },
      }),
    );
    expect(some).toMatch(/^\d+ procedures/);
    expect(some).toContain("admin.list  query  isAdmin > protectedProcedure");
    const bad = await client.callTool({
      name: "api_procedures",
      arguments: { router: "zzz" },
    });
    expect(bad.isError).toBe(true);
  });

  it("serves the conventions doc and refuses outside paths", async () => {
    expect(
      text(await client.callTool({ name: "conventions", arguments: {} })),
    ).toContain("## Branch flow");
    const escape = await client.callTool({
      name: "docs_read",
      arguments: { path: "../x" },
    });
    expect(escape.isError).toBe(true);
  });

  it("answers the code graph tools", async () => {
    const call = async (name: string, args: Record<string, unknown>) =>
      text(await client.callTool({ name, arguments: args }));
    expect(await call("code_symbol", { name: "userRouter" })).toContain(
      "packages/api/src/routers/user.ts",
    );
    expect(
      await call("code_outline", { path: "sites/mainweb/lib/trpc.tsx" }),
    ).toContain("export const trpc");
    expect(
      await call("code_deps", {
        path: "sites/mainweb/lib/trpc.tsx",
        direction: "importers",
      }),
    ).toContain("<- sites/mainweb/app/(portal)/admin/AdminPage.tsx");
    expect(
      await call("code_impact", {
        target: "sites/mainweb/components/portal/EventCheckIn.tsx",
      }),
    ).toContain("/checkin");
    const bad = await client.callTool({
      name: "code_deps",
      arguments: { path: "sites/mainweb/lib/trpc.tsx", depth: 9 },
    });
    expect(bad.isError).toBe(true);
  }, 60_000);

  it("rejects a task outside the four", async () => {
    await expect(
      client.callTool({ name: "run_check", arguments: { task: "format" } }),
    ).resolves.toMatchObject({ isError: true });
  });
});
