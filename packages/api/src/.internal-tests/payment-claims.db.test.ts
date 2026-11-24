import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";
import type * as MembershipModule from "@query/db/services/membership";

/**
 * Real-Postgres test for claiming a stored payment: the amount has to buy the
 * plan, linkAccount needs the payer account email, and two grants for one
 * person both count. Needs TEST_DATABASE_URL (a disposable local database;
 * never Neon or production) and skips without it.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("payment claims against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const emailOf = (tag: string) => `pc-${suffix}-${tag}@example.test`;
  const userIds: string[] = [];

  let ctx: any;
  let appRouter: any;
  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let membership: typeof MembershipModule;

  const makeUser = async (tag: string, email = emailOf(tag)) => {
    const id = `pc-${suffix}-${tag}`;
    await S.db!.insert(S.users).values({ id, email, name: `User ${tag}` });
    userIds.push(id);
    return id;
  };
  const makePayment = async (
    tag: string,
    email: string,
    amountTotal: number,
    metadata: Record<string, string> | null,
    customerName = "Ada Lovelace",
  ) => {
    const [row] = await S.db!
      .insert(S.stripePayments)
      .values({
        stripeSessionId: `pc-${suffix}-${tag}`,
        customerEmail: email,
        customerName,
        amountTotal,
        currency: "usd",
        paymentStatus: "paid",
        metadata: metadata ? JSON.stringify(metadata) : null,
      })
      .returning();
    return row!;
  };
  const paymentRow = async (id: string) =>
    (
      await S.db!
        .select()
        .from(S.stripePayments)
        .where(ops.eq(S.stripePayments.id, id))
    )[0]!;
  const memberRow = async (userId: string) =>
    (
      await S.db!
        .select()
        .from(S.members)
        .where(ops.eq(S.members.userId, userId))
    )[0];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    membership = await import("@query/db/services/membership");
    ({ appRouter } = await import("../root"));
    const { cache } = await import("../middleware/cache");
    ctx = (userId: string) => ({
      db: S.db,
      session: { user: { id: userId } },
      userId,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    });
  }, 120_000);

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    await db
      .delete(S.stripePayments)
      .where(ops.like(S.stripePayments.stripeSessionId, `pc-${suffix}-%`));
    if (userIds.length) {
      await db.delete(S.members).where(ops.inArray(S.members.userId, userIds));
      await db.delete(S.users).where(ops.inArray(S.users.id, userIds));
    }
  });

  describe("linkAccount", () => {
    it("refuses the exact payer name from an account with another email", async () => {
      const mallory = await makeUser("mallory");
      const email = emailOf("victim1");
      const payment = await makePayment("la1", email, 2500, null);

      for (const [firstName, lastName] of [
        ["Ada", "Lovelace"],
        ["Ada", "Ada"],
      ]) {
        await expect(
          appRouter
            .createCaller(ctx(mallory))
            .stripe.linkAccount({ firstName, lastName, email }),
        ).rejects.toThrow(/No payment found/);
      }

      expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
      expect(await memberRow(mallory)).toBeUndefined();
    });

    it("links for the account whose email is the payer email", async () => {
      const email = emailOf("payer2");
      const payer = await makeUser("payer2", email);
      const payment = await makePayment("la2", email, 2500, { plan: "annual" });

      const res = await appRouter
        .createCaller(ctx(payer))
        .stripe.linkAccount({ firstName: "Ada", lastName: "Lovelace", email });
      expect(res.success).toBe(true);
      expect((await paymentRow(payment.id)).linkedUserId).toBe(payer);
      expect((await memberRow(payer))?.isActive).toBe(true);
    });

    it("does not grant a payment whose amount does not match the plan", async () => {
      const email = emailOf("payer3");
      const payer = await makeUser("payer3", email);
      // $15 stamped "annual" is the semester price, not the year price.
      const payment = await makePayment("la3", email, 1500, { plan: "annual" });

      await expect(
        appRouter
          .createCaller(ctx(payer))
          .stripe.linkAccount({ firstName: "Ada", lastName: "Lovelace", email }),
      ).rejects.toThrow(/No payment found/);
      expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
      expect(await memberRow(payer)).toBeUndefined();
    });
  });

  describe("amount-checked claims", () => {
    const rejected: [string, number, Record<string, string> | null][] = [
      ["one dollar, no metadata", 100, null],
      ["one dollar, empty object", 100, {}],
      ["ten dollars stamped annual", 1000, { plan: "annual" }],
      ["fifteen dollars stamped annual", 1500, { plan: "annual" }],
      ["twenty-five dollars stamped semester", 2500, { plan: "semester" }],
    ];

    it.each(rejected)(
      "attemptAutoLink grants nothing for %s",
      async (label, amount, metadata) => {
        const tag = `auto-${label.replace(/\W+/g, "")}`;
        const email = emailOf(tag);
        const user = await makeUser(tag, email);
        const payment = await makePayment(tag, email, amount, metadata);

        const res = await appRouter
          .createCaller(ctx(user))
          .stripe.attemptAutoLink();

        expect(res.success).toBe(false);
        expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
        expect(await memberRow(user)).toBeUndefined();
      },
    );

    it.each(rejected)(
      "the sign-in hook grants nothing for %s",
      async (label, amount, metadata) => {
        const tag = `hook-${label.replace(/\W+/g, "")}`;
        const email = emailOf(tag);
        const user = await makeUser(tag, email);
        const payment = await makePayment(tag, email, amount, metadata);

        const out = await membership.linkPaidPaymentByVerifiedEmail(S.db!, {
          userId: user,
          email,
        });

        expect(out.linked).toBe(false);
        expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
        expect(await memberRow(user)).toBeUndefined();
      },
    );

    it("the sign-in hook skips a junk payment and claims the real one", async () => {
      const email = emailOf("both");
      const user = await makeUser("both", email);
      const junk = await makePayment("both-junk", email, 100, null);
      const real = await makePayment("both-real", email, 2500, null);

      const out = await membership.linkPaidPaymentByVerifiedEmail(S.db!, {
        userId: user,
        email,
      });

      expect(out).toEqual({ linked: true, paymentId: real.id });
      expect((await paymentRow(junk.id)).linkedUserId).toBeNull();
      expect((await memberRow(user))?.isActive).toBe(true);
    });

    it("an exact annual-price payment with no metadata is still granted", async () => {
      const email = emailOf("exact");
      const user = await makeUser("exact", email);
      await makePayment("exact", email, 2500, null);

      const res = await appRouter
        .createCaller(ctx(user))
        .stripe.attemptAutoLink();

      expect(res.success).toBe(true);
      const member = await memberRow(user);
      expect(member!.membershipEndDate!.getTime()).toBeGreaterThan(
        Date.now() + 360 * 86_400_000,
      );
    });
  });

  describe("concurrent grants", () => {
    it("extends twice for two simultaneous grants to a new member", async () => {
      const user = await makeUser("race-new");
      const grant = () =>
        membership.createOrUpdateMembership(S.db!, {
          userId: user,
          firstName: "Race",
          lastName: "New",
        });

      await Promise.all([grant(), grant()]);

      const member = (await memberRow(user))!;
      expect(member.renewalCount).toBe(1);
      // Two paid years from today, not one.
      expect(member.membershipEndDate!.getTime()).toBeGreaterThan(
        Date.now() + 725 * 86_400_000,
      );
    });

    it("extends from the locked row for simultaneous grants to a member", async () => {
      const user = await makeUser("race-old");
      await membership.createOrUpdateMembership(S.db!, {
        userId: user,
        firstName: "Race",
        lastName: "Old",
      });
      const before = (await memberRow(user))!;

      const grant = () =>
        membership.createOrUpdateMembership(S.db!, {
          userId: user,
          firstName: "Race",
          lastName: "Old",
        });
      await Promise.all([grant(), grant(), grant()]);

      const after = (await memberRow(user))!;
      expect(after.renewalCount).toBe(before.renewalCount + 3);
      const year = 365 * 86_400_000;
      expect(
        after.membershipEndDate!.getTime() -
          before.membershipEndDate!.getTime(),
      ).toBeGreaterThanOrEqual(3 * year);
    });
  });
});
