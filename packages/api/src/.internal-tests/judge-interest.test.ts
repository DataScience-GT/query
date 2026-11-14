import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

/**
 * The organiser's list of judge-interest leads. Names and emails of people who
 * never made an account: only staff may read it.
 */

const mockAdminFindFirst = vi.fn();
const mockRows = vi.fn(() => [] as unknown[]);

vi.mock("@query/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const selectChain = () => {
    const node: any = {
      from: () => node,
      orderBy: () => node,
      limit: () => Promise.resolve(mockRows()),
      then: (ok: any, err: any) =>
        Promise.resolve([{ total: mockRows().length }]).then(ok, err),
    };
    return node;
  };
  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockAdminFindFirst(name, ...args),
    findMany: async () => [],
  });
  return {
    ...actual,
    db: {
      query: { admins: table("admins"), users: table("users") },
      select: selectChain,
    },
  };
});

import { db } from "@query/db";

const callerFor = (userId?: string) =>
  appRouter.createCaller({
    db,
    session: userId ? { user: { id: userId } } : null,
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as never);

describe("judge.interestList", () => {
  beforeEach(() => {
    mockAdminFindFirst.mockReset();
    mockRows.mockReset().mockReturnValue([]);
    cache.clear();
  });

  it("rejects a signed-out caller", async () => {
    await expect(callerFor().judge.interestList()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a signed-in non-admin", async () => {
    mockAdminFindFirst.mockResolvedValue(undefined);
    await expect(
      callerFor("user_plain").judge.interestList(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the rows and a count to an admin", async () => {
    mockAdminFindFirst.mockResolvedValue({
      id: "ad_1",
      role: "admin",
      isActive: true,
    });
    mockRows.mockReturnValue([{ id: "1", email: "a@b.co" }]);
    const result = await callerFor("user_admin").judge.interestList();
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
});
