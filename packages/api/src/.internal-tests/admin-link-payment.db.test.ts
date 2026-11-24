import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";

/**
 * Real-Postgres test for an officer linking a stored payment to an account:
 * the amount must buy something, the payment and the account must both be
 * free, and the action is audited. Needs TEST_DATABASE_URL (a disposable
 * local database; never Neon or production) and skips without it.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("admin payment linking against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const emailOf = (tag: string) => `al-${suffix}-${tag}@example.test`;
  const userIds: string[] = [];

  let ctx: any;
  let appRouter: any;
  let S: typeof DbModule;
  let ops: typeof DrizzleOps;

  const makeUser = async (tag: string) => {
    const id = `al-${suffix}-${tag}`;
    await S.db!
      .insert(S.users)
      .values({ id, email: emailOf(tag), name: `User ${tag}` });
    userIds.push(id);
    return id;
  };
  const makePayment = async (
    tag: string,
    amountTotal: number,
    opts: {
      metadata?: Record<string, string> | null;
      status?: "paid" | "unpaid";
      email?: string;
    } = {},
  ) => {
    const [row] = await S.db!
      .insert(S.stripePayments)
      .values({
        stripeSessionId: `al-${suffix}-${tag}`,
        customerEmail: opts.email ?? emailOf(`payer-${tag}`),
        customerName: "Ada Lovelace",
        amountTotal,
        currency: "usd",
        paymentStatus: opts.status ?? "paid",
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
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

  const adminId = async () => {
    const id = await makeUser(`admin${userIds.length}`);
    await S.db!.insert(S.admins).values({ userId: id, role: "admin" });
    return id;
  };

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    await db
      .delete(S.stripePayments)
      .where(ops.like(S.stripePayments.stripeSessionId, `al-${suffix}-%`));
    if (userIds.length) {
      await db
        .delete(S.auditLogs)
        .where(ops.inArray(S.auditLogs.userId, userIds));
      await db.delete(S.members).where(ops.inArray(S.members.userId, userIds));
      await db.delete(S.users).where(ops.inArray(S.users.id, userIds));
    }
  });

  it("links an unlinked $25 payment and makes the user a member", async () => {
    const admin = await adminId();
    const target = await makeUser("target1");
    const payment = await makePayment("ok1", 2500);

    const res = await appRouter
      .createCaller(ctx(admin))
      .stripe.linkPaymentToUser({ paymentId: payment.id, userId: target });
    expect(res.success).toBe(true);
    expect(res.entitlement).toMatchObject({ plan: "annual", bootcamp: false });

    const row = await paymentRow(payment.id);
    expect(row.linkedUserId).toBe(target);
    expect(row.linkedAt).not.toBeNull();
    const member = await memberRow(target);
    expect(member?.isActive).toBe(true);

    const [link] = await S.db!
      .select()
      .from(S.userAccountLinks)
      .where(ops.eq(S.userAccountLinks.stripePaymentId, payment.id));
    expect(link?.userId).toBe(target);

    const audit = await S.db!
      .select()
      .from(S.auditLogs)
      .where(
        ops.and(
          ops.eq(S.auditLogs.action, "stripe.linkPaymentToUser"),
          ops.eq(S.auditLogs.resourceId, payment.id),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.userId).toBe(admin);
    expect(audit[0]!.severity).toBe("critical");
  });

  it("resolves the target by email, case-insensitively", async () => {
    const admin = await adminId();
    const target = await makeUser("target2");
    const payment = await makePayment("email2", 3500, {
      metadata: { plan: "annual", bootcamp: "true" },
    });

    const res = await appRouter
      .createCaller(ctx(admin))
      .stripe.linkPaymentToUser({
        paymentId: payment.id,
        email: emailOf("target2").toUpperCase(),
      });
    expect(res.entitlement).toMatchObject({ plan: "annual", bootcamp: true });
    expect((await memberRow(target))?.bootcampMember).toBe(true);
  });

  it("refuses an unknown email", async () => {
    const admin = await adminId();
    const payment = await makePayment("noemail", 2500);
    await expect(
      appRouter.createCaller(ctx(admin)).stripe.linkPaymentToUser({
        paymentId: payment.id,
        email: emailOf("nobody"),
      }),
    ).rejects.toThrow(/No account has that email/);
    expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
  });

  it("refuses an already-linked payment", async () => {
    const admin = await adminId();
    const first = await makeUser("first3");
    const second = await makeUser("second3");
    const payment = await makePayment("linked3", 2500);
    const caller = appRouter.createCaller(ctx(admin));
    await caller.stripe.linkPaymentToUser({
      paymentId: payment.id,
      userId: first,
    });

    await expect(
      caller.stripe.linkPaymentToUser({
        paymentId: payment.id,
        userId: second,
      }),
    ).rejects.toThrow(/already been linked/);
    expect((await paymentRow(payment.id)).linkedUserId).toBe(first);
    expect(await memberRow(second)).toBeUndefined();
  });

  it("refuses an unpaid payment", async () => {
    const admin = await adminId();
    const target = await makeUser("target4");
    const payment = await makePayment("unpaid4", 2500, { status: "unpaid" });
    await expect(
      appRouter
        .createCaller(ctx(admin))
        .stripe.linkPaymentToUser({ paymentId: payment.id, userId: target }),
    ).rejects.toThrow(/not paid/);
    expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
    expect(await memberRow(target)).toBeUndefined();
  });

  it("refuses a junk amount", async () => {
    const admin = await adminId();
    const target = await makeUser("target5");
    const payment = await makePayment("junk5", 100);
    await expect(
      appRouter
        .createCaller(ctx(admin))
        .stripe.linkPaymentToUser({ paymentId: payment.id, userId: target }),
    ).rejects.toThrow(/does not match any membership/);
    expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
    expect(await memberRow(target)).toBeUndefined();
  });

  it("refuses a user who already has a linked payment", async () => {
    const admin = await adminId();
    const target = await makeUser("target6");
    const one = await makePayment("one6", 2500);
    const two = await makePayment("two6", 2500);
    const caller = appRouter.createCaller(ctx(admin));
    await caller.stripe.linkPaymentToUser({ paymentId: one.id, userId: target });

    await expect(
      caller.stripe.linkPaymentToUser({ paymentId: two.id, userId: target }),
    ).rejects.toThrow(/already linked to a payment/);
    expect((await paymentRow(two.id)).linkedUserId).toBeNull();
  });

  it("refuses a non-admin", async () => {
    const nobody = await makeUser("nobody7");
    const target = await makeUser("target7");
    const payment = await makePayment("na7", 2500);
    const caller = appRouter.createCaller(ctx(nobody));
    await expect(
      caller.stripe.linkPaymentToUser({ paymentId: payment.id, userId: target }),
    ).rejects.toThrow(/Admin access required/);
    await expect(caller.stripe.listUnlinkedPayments({})).rejects.toThrow(
      /Admin access required/,
    );
    expect((await paymentRow(payment.id)).linkedUserId).toBeNull();
  });

  it("lists only paid unlinked payments with their entitlement", async () => {
    const admin = await adminId();
    const target = await makeUser("target8");
    const shared = emailOf("list-me");
    const ok = await makePayment("l-ok", 2500, { email: shared });
    const junk = await makePayment("l-junk", 100, { email: shared });
    await makePayment("l-unpaid", 2500, { status: "unpaid", email: shared });
    const done = await makePayment("l-done", 2500, { email: shared });
    const caller = appRouter.createCaller(ctx(admin));
    await caller.stripe.linkPaymentToUser({
      paymentId: done.id,
      userId: target,
    });

    const res = await caller.stripe.listUnlinkedPayments({
      query: "list-me",
    });
    const ids = res.items.map((i: any) => i.id);
    expect(ids).toHaveLength(2);
    expect(res.total).toBe(2);
    expect(ids).toContain(ok.id);
    expect(ids).toContain(junk.id);
    expect(res.items.find((i: any) => i.id === ok.id).entitlement).toEqual({
      plan: "annual",
      bootcamp: false,
      addOnOnly: false,
    });
    expect(res.items.find((i: any) => i.id === junk.id).entitlement).toBeNull();
  });
});
