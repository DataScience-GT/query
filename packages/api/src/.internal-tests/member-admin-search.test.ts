import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

/** member.adminSearch matches what staff typed literally, not as a LIKE pattern. */

const mockFindFirst = vi.fn();
const wheres: unknown[] = [];

vi.mock("@query/db", () => {
  const select = () => {
    const node: any = Promise.resolve([]);
    for (const m of ["from", "leftJoin", "innerJoin", "limit", "orderBy"]) {
      node[m] = () => node;
    }
    node.where = (clause: unknown) => {
      wheres.push(clause);
      return node;
    };
    return node;
  };
  const placeholder = new Proxy(
    {},
    { get: (_t, key) => (typeof key === "string" ? key : undefined) },
  );
  const db = {
    query: {
      admins: { findFirst: (...a: any[]) => mockFindFirst("admins", ...a) },
    },
    select,
  };
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === "db") return db;
        if (key === "then" || typeof key !== "string") return undefined;
        return placeholder;
      },
      has: () => true,
    },
  );
});

import { db } from "@query/db";

beforeEach(() => {
  wheres.length = 0;
  mockFindFirst.mockReset();
  mockFindFirst.mockResolvedValue({
    id: "ad_1",
    userId: "search_user",
    role: "admin",
    isActive: true,
    expiresAt: null,
  });
});

const search = (query: string) =>
  appRouter
    .createCaller({
      db,
      session: { user: { id: "search_user" } },
      userId: "search_user",
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    } as never)
    .member.adminSearch({ query });

/** Every string the where clause carries, however it is nested. */
const stringsIn = (clause: unknown) => {
  const found: string[] = [];
  const seen = new Set<unknown>();
  const walk = (node: any) => {
    if (typeof node === "string") found.push(node);
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (node.constructor?.name === "Param") found.push(String(node.value));
    if (Array.isArray(node.queryChunks)) node.queryChunks.forEach(walk);
    if (Array.isArray(node)) node.forEach(walk);
  };
  walk(clause);
  return found;
};

describe("member.adminSearch", () => {
  it("escapes % and _ so a pasted wildcard matches only itself", async () => {
    await search("100%_off");
    expect(stringsIn(wheres[0])).toContain("%100\\%\\_off%");
  });

  it("escapes a backslash too", async () => {
    await search("a\\b");
    expect(stringsIn(wheres[0])).toContain("%a\\\\b%");
  });
});
