#!/usr/bin/env node
/**
 * Repo-local MCP server for coding agents, over stdio:
 *
 *   node tooling/mcp/src/server.ts
 *
 * Every answer is read from the working tree when the tool is called, so it
 * cannot go stale. Everything is read-only except run_check, which runs one of
 * four turbo tasks. Registered for Claude Code in the root .mcp.json.
 */
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { apiProcedures } from "./api.ts";
import { runCheck, TASKS } from "./check.ts";
import { codeDeps, codeImpact, codeOutline, codeSymbol } from "./code.ts";
import { dbSchema } from "./db.ts";
import { docsRead, docsSearch } from "./docs.ts";
import { formatRoutes, routes } from "./routes.ts";
import { read, ROOT } from "./source.ts";
import { formatWorkspaces, workspaces } from "./workspace.ts";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

// A thrown error becomes a tool error the agent can read and act on.
const reply = (produce: () => string): Result => {
  try {
    return { content: [{ type: "text", text: produce() }] };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text }], isError: true };
  }
};

// The repo's one version, from this package's package.json.
const { version } = JSON.parse(
  read(resolve(ROOT, "tooling/mcp/package.json")),
) as { version: string };

function createServer(): McpServer {
  const server = new McpServer({ name: "query", version });
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "workspace",
    {
      description:
        "Every workspace package and site: name, path, description, scripts, internal workspace:* dependencies and what depends on it.",
      annotations: readOnly,
    },
    async () => reply(() => formatWorkspaces(workspaces())),
  );

  server.registerTool(
    "docs_search",
    {
      description:
        "Search docs/**, the root README, .github/CONTRIBUTING, and package READMEs. Returns the best files with matching lines as path:line.",
      inputSchema: { query: z.string().min(1).describe("Words to look for") },
      annotations: readOnly,
    },
    async ({ query }) => reply(() => docsSearch(query)),
  );

  server.registerTool(
    "docs_read",
    {
      description:
        "Read one documentation file by repo-relative path (as returned by docs_search). Paths outside the repo or outside the docs set are rejected.",
      inputSchema: {
        path: z.string().min(1).describe("e.g. docs/contributing.md"),
      },
      annotations: readOnly,
    },
    async ({ path }) => reply(() => docsRead(path)),
  );

  server.registerTool(
    "api_procedures",
    {
      description:
        "tRPC procedures in packages/api: dotted name, query or mutation, the procedure kind and its parents (protectedProcedure, isAdmin, ...), extra .use() middleware, and file:line. Optionally limit to one router such as `judging.admin`.",
      inputSchema: {
        router: z
          .string()
          .optional()
          .describe("Router path prefix, e.g. hackathon"),
      },
      annotations: readOnly,
    },
    async ({ router }) => reply(() => apiProcedures(router)),
  );

  server.registerTool(
    "db_schema",
    {
      description:
        "Drizzle tables in packages/db: table, columns with type, nullability, defaults and references, constraints, and file:line. With no argument lists every table. `table` matches the exported name or the SQL name.",
      inputSchema: {
        table: z
          .string()
          .optional()
          .describe("e.g. hackathons or hackathon_team"),
      },
      annotations: readOnly,
    },
    async ({ table }) => reply(() => dbSchema(table)),
  );

  server.registerTool(
    "routes",
    {
      description:
        "sites/mainweb App Router routes: URL, route group, page and route-handler files (with methods), layouts, and whether a page is a client component.",
      annotations: readOnly,
    },
    async () => reply(() => formatRoutes(routes())),
  );

  server.registerTool(
    "code_symbol",
    {
      description:
        "Where a symbol is defined across sites, packages and tooling: exported functions, components, consts, types, tRPC routers. Exact, then prefix, then substring match. Returns kind, file:line and signature. A dotted tRPC path such as admin.list also works.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("e.g. userRouter, AdminLayout, protectedProcedure"),
      },
      annotations: readOnly,
    },
    async ({ name }) => reply(() => codeSymbol(name)),
  );

  server.registerTool(
    "code_outline",
    {
      description:
        "A file's imports (resolved to repo files) and top-level declarations with line ranges and one-line signatures, instead of its body. Path is repo-relative, or a unique path suffix.",
      inputSchema: {
        path: z.string().min(1).describe("e.g. sites/mainweb/lib/trpc.tsx"),
      },
      annotations: readOnly,
    },
    async ({ path }) => reply(() => codeOutline(path)),
  );

  server.registerTool(
    "code_deps",
    {
      description:
        "Import edges of a file: what it imports, or what imports it, up to depth 3. Resolves relative paths, @/ aliases and workspace package names (via package.json exports). External packages are listed, not expanded.",
      inputSchema: {
        path: z.string().min(1).describe("Repo-relative file"),
        direction: z.enum(["imports", "importers"]).default("imports"),
        depth: z.number().int().min(1).max(3).default(1),
      },
      annotations: readOnly,
    },
    async ({ path, direction, depth }) =>
      reply(() => codeDeps(path, direction, depth)),
  );

  server.registerTool(
    "code_impact",
    {
      description:
        "What a change touches: transitive importers of a file or exported symbol, grouped by workspace, plus the mainweb App Router routes (page, layout, route files, with client or server) that end up importing it.",
      inputSchema: {
        target: z
          .string()
          .min(1)
          .describe("A file path or an exported symbol name"),
      },
      annotations: readOnly,
    },
    async ({ target }) => reply(() => codeImpact(target)),
  );

  server.registerTool(
    "conventions",
    {
      description:
        "Repo conventions for agents (docs/conventions.md): branch flow, versioning, pnpm catalogs, turbo tasks, test database rule, lint and format, where things live.",
      annotations: readOnly,
    },
    async () => reply(() => read(resolve(ROOT, "docs/conventions.md"))),
  );

  server.registerTool(
    "run_check",
    {
      description: `Run \`pnpm turbo run <task>\` from the repo root and return the exit code and the tail of the output. Tasks: ${TASKS.join(", ")}. Optional filter is a workspace name from the workspace tool. test and build are refused when DATABASE_URL or TEST_DATABASE_URL points off this machine. Times out after 10 minutes.`,
      inputSchema: {
        task: z.enum(TASKS),
        filter: z
          .string()
          .optional()
          .describe("Workspace name, e.g. @query/api"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ task, filter }) => {
      try {
        const { ok, text } = await runCheck(task, filter);
        return { content: [{ type: "text" as const, text }], isError: !ok };
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text }], isError: true };
      }
    },
  );

  return server;
}

if (import.meta.main) {
  await createServer().connect(new StdioServerTransport());
}
