import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";

/**
 * Real-Postgres test for the hackathon store sale: scan a pass, pick an item,
 * and the item's price comes off the hacker's points.
 *
 * Runs the real `points.store.purchase` and `points.store.lookupParticipant`
 * procedures as a scanner. Needs TEST_DATABASE_URL (a local, disposable
 * database; never Neon or production) and skips without it. It inserts its own
 * rows under a random suffix and removes them afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("store sale against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const scannerId = `ss-${suffix}-scanner`;
  const buyerId = `ss-${suffix}-buyer`;
  const lateId = `ss-${suffix}-late`;

  const PRICE = 30;
  const STOCK = 5;
  const EARNED = 100;

  let ctx: any;
  let appRouter: any;
  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let hackathonId: string;
  let buyerPid: string;
  let latePid: string;
  let itemId: string;

  const caller = () => appRouter.createCaller(ctx(scannerId));
  const sale = (over: Record<string, unknown> = {}) => ({
    hackathonId,
    purchaseId: crypto.randomUUID(),
    participantId: buyerPid,
    itemId,
    quantity: 1,
    unitPrice: PRICE,
    ...over,
  });
  const lookup = (participantId = buyerPid) =>
    caller().points.store.lookupParticipant({ hackathonId, participantId });
  const readItem = async () => {
    const [row] = await S.db!
      .select()
      .from(S.hackathonStoreItems)
      .where(ops.eq(S.hackathonStoreItems.id, itemId));
    return row!;
  };
  const setItem = (values: { stock?: number; price?: number }) =>
    S.db!
      .update(S.hackathonStoreItems)
      .set(values)
      .where(ops.eq(S.hackathonStoreItems.id, itemId));
  const purchaseRows = (participantId: string) =>
    S.db!
      .select()
      .from(S.hackathonStorePurchases)
      .where(ops.eq(S.hackathonStorePurchases.participantId, participantId));
  const grant = (participantId: string, delta: number) =>
    S.db!.insert(S.hackathonPointAdjustments).values({
      hackathonId,
      participantId,
      delta,
      reason: "test grant",
    });

  // Importing the whole router is the slow part; a cold run on a busy machine
  // takes close to a minute.
  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    ({ appRouter } = await import("../root"));
    const { cache } = await import("../middleware/cache");
    const db = S.db!;

    ctx = (userId?: string) => ({
      db,
      session: userId ? { user: { id: userId } } : null,
      userId,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    });

    await db.insert(S.users).values(
      [scannerId, buyerId, lateId].map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    await db.insert(S.admins).values({ userId: scannerId, role: "admin" });

    const [hackathon] = await db
      .insert(S.hackathons)
      .values({
        name: `ss hackathon ${suffix}`,
        startDate: new Date(Date.now() + 86_400_000),
        endDate: new Date(Date.now() + 2 * 86_400_000),
        status: "open",
        maxParticipants: 10,
      })
      .returning({ id: S.hackathons.id });
    hackathonId = hackathon!.id;

    const [buyer, late] = await db
      .insert(S.hackathonParticipants)
      .values([
        { hackathonId, userId: buyerId, registrationStatus: "checked_in" },
        { hackathonId, userId: lateId, registrationStatus: "approved" },
      ])
      .returning({ id: S.hackathonParticipants.id });
    buyerPid = buyer!.id;
    latePid = late!.id;

    // Earned points: a staff adjustment is the simplest row that counts.
    await db.insert(S.hackathonPointAdjustments).values(
      [buyerPid, latePid].map((participantId) => ({
        hackathonId,
        participantId,
        delta: EARNED,
        reason: "test grant",
      })),
    );

    const [item] = await db
      .insert(S.hackathonStoreItems)
      .values({ hackathonId, name: "Sticker", price: PRICE, stock: STOCK })
      .returning({ id: S.hackathonStoreItems.id });
    itemId = item!.id;
  }, 120_000);

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    if (hackathonId) {
      await db
        .delete(S.hackathons)
        .where(ops.eq(S.hackathons.id, hackathonId));
    }
    await db
      .delete(S.users)
      .where(ops.inArray(S.users.id, [scannerId, buyerId, lateId]));
  }, 60_000);

  it("shows the earned balance after a scan", async () => {
    expect(await lookup()).toMatchObject({
      id: buyerPid,
      registrationStatus: "checked_in",
      balance: { earned: EARNED, spent: 0, available: EARNED },
    });
  });

  it("takes price times quantity off the points and the quantity off the shelf", async () => {
    const Q = 2;
    const result = await caller().points.store.purchase(sale({ quantity: Q }));

    expect(result.replayed).toBe(false);
    expect(result.purchase).toMatchObject({
      participantId: buyerPid,
      itemId,
      quantity: Q,
      unitPrice: PRICE,
      total: PRICE * Q,
    });
    const after = {
      earned: EARNED,
      spent: PRICE * Q,
      available: EARNED - PRICE * Q,
    };
    expect(result.balance).toEqual(after);
    // What the station shows on the next scan.
    expect((await lookup()).balance).toEqual(after);
    expect((await readItem()).stock).toBe(STOCK - Q);
    expect(await purchaseRows(buyerPid)).toHaveLength(1);
  });

  it("does not charge twice when the same sale is replayed", async () => {
    await setItem({ stock: STOCK });
    const before = (await lookup()).balance;
    const rowsBefore = (await purchaseRows(buyerPid)).length;

    const input = sale();
    const first = await caller().points.store.purchase(input);
    expect(first.replayed).toBe(false);
    const again = await caller().points.store.purchase(input);

    expect(again.replayed).toBe(true);
    expect(again.purchase.id).toBe(input.purchaseId);
    expect((await lookup()).balance.available).toBe(before.available - PRICE);
    expect((await readItem()).stock).toBe(STOCK - 1);
    expect(await purchaseRows(buyerPid)).toHaveLength(rowsBefore + 1);
  });

  it("refuses a sale the buyer cannot afford and charges nothing", async () => {
    const { available } = (await lookup()).balance;
    const rowsBefore = (await purchaseRows(buyerPid)).length;
    // One unit more than they can pay for, with the shelf stocked for it.
    const quantity = Math.floor(available / PRICE) + 1;
    await setItem({ stock: 20 });

    await expect(
      caller().points.store.purchase(sale({ quantity })),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect((await lookup()).balance.available).toBe(available);
    expect((await readItem()).stock).toBe(20);
    expect(await purchaseRows(buyerPid)).toHaveLength(rowsBefore);
  });

  it.each([
    { stock: 1, quantity: 2, message: "Only 1 Sticker left." },
    { stock: 0, quantity: 1, message: "Sticker is sold out." },
  ])(
    "refuses $quantity when the shelf holds $stock and charges nothing",
    async ({ stock, quantity, message }) => {
      // Points cover the sale, so only the shelf can be the reason to refuse.
      await grant(buyerPid, PRICE * quantity);
      const before = (await lookup()).balance;
      expect(before.available).toBeGreaterThanOrEqual(PRICE * quantity);
      const rowsBefore = (await purchaseRows(buyerPid)).length;
      await setItem({ stock });

      await expect(
        caller().points.store.purchase(sale({ quantity })),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message });

      expect((await lookup()).balance).toEqual(before);
      expect((await readItem()).stock).toBe(stock);
      expect(await purchaseRows(buyerPid)).toHaveLength(rowsBefore);
    },
  );

  it("refuses a hacker who has not checked in", async () => {
    await setItem({ stock: STOCK });
    await expect(
      caller().points.store.purchase(sale({ participantId: latePid })),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect((await lookup(latePid)).balance).toEqual({
      earned: EARNED,
      spent: 0,
      available: EARNED,
    });
    expect(await purchaseRows(latePid)).toHaveLength(0);
    expect((await readItem()).stock).toBe(STOCK);
  });

  it("refuses a stale unit price with CONFLICT", async () => {
    await setItem({ stock: STOCK, price: PRICE + 5 });
    const { available } = (await lookup()).balance;

    await expect(
      caller().points.store.purchase(sale({ unitPrice: PRICE })),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect((await lookup()).balance.available).toBe(available);
    expect((await readItem()).stock).toBe(STOCK);
  });
});
