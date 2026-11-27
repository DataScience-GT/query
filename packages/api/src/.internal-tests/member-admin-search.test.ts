import { describe, it, expect, vi, beforeEach } from "vitest";
import { testCaller } from "./_caller";

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

const search = (query: string, userId = "search_user") =>
  testCaller(db, userId).member.adminSearch({ query });

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

  // Searching by address confirms an account exists, which admin.findUserByEmail
  // already refuses a read-only bug tester. This search is a superset of it.
  it("is closed to a bug tester, as findUserByEmail is", async () => {
    // Its own user: the admin row is cached per user for a minute.
    mockFindFirst.mockResolvedValue({
      id: "ad_2",
      userId: "tester_user",
      role: "bug_tester",
      isActive: true,
      expiresAt: null,
    });

    await expect(search("someone@gatech.edu", "tester_user")).rejects.toThrow(
      /Admin access required/,
    );
    expect(wheres).toHaveLength(0);
  });
});
