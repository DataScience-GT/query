import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db } from "@query/db";
import {
  MEMBERSHIP_CENTS,
  SEMESTER_MEMBERSHIP_CENTS,
  BOOTCAMP_ADDON_CENTS,
  entitlementForCents,
} from "../services/pricing";

/**
 * Membership payment flow.
 *
 * These cover the three defects behind "Payment service is currently
 * unavailable" in the portal:
 *   1. getStripe() memoized `null`, so one call made before the environment was
 *      populated disabled payments for the whole process lifetime.
 *   2. createPaymentIntent called getStripe() before its mock-mode branch, so a
 *      `mk_` dev key still constructed a real Stripe SDK.
 *   3. createCheckoutSession charged 2500 ($25) for a membership the UI and
 *      createPaymentIntent both price at 1500 ($15).
 */

const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
/** The values handed to `.set()`, so a test can tell an add-on stamp from a
 *  renewal — the two differ only in which columns move. */
const mockUpdateSet = vi.fn();

/**
 * The Stripe SDK is stubbed so no test reaches the network.
 *
 * Without this, "refuses a mock intent id when not in mock mode" set a fake
 * secret key and then genuinely called api.stripe.com — the request spent ~23
 * seconds on SDK retries and failed the whole suite whenever the machine was
 * offline or slow, for reasons that had nothing to do with the assertion.
 */
/** Payment intents `reconcileMyPayments` should find. Set per test. */
const mockSearchResults = vi.fn<() => unknown[]>(() => []);

vi.mock("stripe", () => ({
  default: class {
    paymentIntents = {
      search: vi.fn(async () => ({ data: mockSearchResults() })),
      retrieve: vi.fn(async (id: string) => {
        throw new Error(`No such payment_intent: ${id}`);
      }),
      create: vi.fn(async () => ({
        id: "pi_stub",
        client_secret: "pi_stub_secret",
      })),
    };
    checkout = {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_stub", url: "https://stub" })),
      },
    };
  },
}));

vi.mock("@query/db", () => {
  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: vi.fn().mockResolvedValue([]),
  });

  return {
    db: {
      transaction: vi.fn().mockImplementation((callback) => callback(db)),
      query: {
        users: table("users"),
        members: table("members"),
        hackathons: table("hackathons"),
        stripePayments: table("stripePayments"),
        membershipHistory: table("membershipHistory"),
        userAccountLinks: table("userAccountLinks"),
        admins: table("admins"),
      },
      insert: () => ({
        values: (...valArgs: any[]) => {
          const val = mockInsert(valArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue([{ id: "payment_row" }]),
            onConflictDoNothing: vi.fn().mockImplementation(() => ({
              returning: vi.fn().mockResolvedValue([{ id: "payment_row" }]),
            })),
          });
        },
      }),
      update: () => ({
        set: (values: unknown) => {
          mockUpdateSet(values);
          return { where: vi.fn().mockResolvedValue(undefined) };
        },
      }),
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
    users: { id: "id", email: "email" },
    members: { id: "id", userId: "user_id", hackathonId: "hackathon_id" },
    membershipHistory: { id: "id", memberId: "member_id" },
    hackathons: { id: "id", status: "status" },
    stripePayments: {
      id: "id",
      customerEmail: "customer_email",
      stripeSessionId: "stripe_session_id",
      linkedUserId: "linked_user_id",
    },
    userAccountLinks: { userId: "user_id", stripePaymentId: "stripe_payment_id" },
    admins: { userId: "user_id", isActive: "is_active" },
  };
});

const USER = "user_paying";
const RETURN_URL = "https://datasciencegt.org/portal";

describe("Membership payments", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  const originalPublishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
    // Both are set per-test; clearing here keeps one test's mode from leaking
    // into the next.
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_MOCK_MODE;
    mockFindFirst.mockImplementation((table) => {
      // Membership rows hang off a hackathon, so checkout needs one to exist.
      if (table === "users")
        return { id: USER, email: "member@gatech.edu", name: "Buzz Member" };
      if (table === "hackathons") return { id: "hack_current", status: "open" };
      return undefined;
    });
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = originalPublishable;
    delete process.env.STRIPE_MOCK_MODE;
  });

  const caller = () =>
    appRouter.createCaller({
      db,
      session: { user: { id: USER } },
      userId: USER,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    } as any);

  describe("payment service availability", () => {
    it("reports unavailable when no secret key is configured", async () => {
      delete process.env.STRIPE_SECRET_KEY;

      await expect(caller().stripe.createPaymentIntent()).rejects.toThrow(
        /currently unavailable/i,
      );
    });

    it("recovers once the key appears, instead of staying broken for the process lifetime", async () => {
      // Regression test for the reported bug: the first call happened before the
      // environment was populated, getStripe() cached `null`, and every later
      // request returned "unavailable" until the server restarted.
      delete process.env.STRIPE_SECRET_KEY;
      await expect(caller().stripe.createPaymentIntent()).rejects.toThrow(
        /currently unavailable/i,
      );

      process.env.STRIPE_MOCK_MODE = "true";
      const result = await caller().stripe.createPaymentIntent();

      expect(result.isMock).toBe(true);
      expect(result.clientSecret).toBeTruthy();
    });
  });

  describe("mock mode", () => {
    it("returns a mock client secret without touching the Stripe SDK", async () => {
      process.env.STRIPE_MOCK_MODE = "true";
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_local";

      const result = await caller().stripe.createPaymentIntent();

      expect(result).toMatchObject({
        clientSecret: "mock_pi_secret",
        publishableKey: "pk_test_local",
        isMock: true,
      });
      // A unique id per call, so two developers (or two runs) do not collide
      // on confirmMembershipAfterPayment's idempotency check.
      expect(result.mockPaymentIntentId).toMatch(/^pi_mock_[0-9a-f]{32}$/);
    });

    /**
     * The whole point of mock mode. It previously returned a fake secret and
     * wrote nothing, while the modal called onSuccess() directly — so the UI
     * said "Access Granted" with no payment row and no member row anywhere,
     * and the club half could not be developed locally at all.
     *
     * Asserting the returned shape (as the test above does) proves nothing
     * about what was written, which is exactly how this survived the suite.
     */
    it("grants a real membership through the production confirm path", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      const { mockPaymentIntentId } = await caller().stripe.createPaymentIntent();

      await caller().stripe.confirmMembershipAfterPayment({
        paymentIntentId: mockPaymentIntentId!,
      });

      // This file mocks insert as mockInsert(valArgs), so the row is c[0][0].
      const written = mockInsert.mock.calls.map((c) => c[0]?.[0]);
      // A payment row, recorded under the same synthetic session id the
      // webhook uses so the two settle each other's race.
      expect(
        written.some((row) => row?.stripeSessionId === `pi_${mockPaymentIntentId}`),
      ).toBe(true);
      // And the membership itself.
      expect(written.some((row) => row?.userId === USER && row?.firstName)).toBe(
        true,
      );
    });

    // isMockMode() is false whenever NODE_ENV=production regardless of the
    // flag, so the live site cannot be talked into minting free memberships.
    it("refuses a mock intent id when not in mock mode", async () => {
      delete process.env.STRIPE_MOCK_MODE;
      process.env.STRIPE_SECRET_KEY = "sk_test_abc";

      await expect(
        caller().stripe.confirmMembershipAfterPayment({
          paymentIntentId: "pi_mock_deadbeefdeadbeefdeadbeefdeadbeef",
        }),
      ).rejects.toThrow();
    });

    it("falls back to a placeholder publishable key when none is set", async () => {
      process.env.STRIPE_MOCK_MODE = "true";
      delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

      const result = await caller().stripe.createPaymentIntent();

      expect(result.publishableKey).toBe("pk_test_mock");
      expect(result.isMock).toBe(true);
    });

    it("completes a mock checkout session and returns a success URL", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      const result = await caller().stripe.createCheckoutSession({
        returnUrl: RETURN_URL,
      });

      expect(result.url).toContain("payment=success");
      expect(result.url).toContain("session_id=cs_mock_");
    });

    it("appends the session with & when the return URL already has a query", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      const result = await caller().stripe.createCheckoutSession({
        returnUrl: `${RETURN_URL}?tab=membership`,
      });

      expect(result.url).toContain("?tab=membership&payment=success");
    });

    /**
     * Mock mode writes paymentStatus "paid" and activates a membership without
     * any money moving, so a production build must ignore the flag entirely —
     * otherwise one stray environment variable turns "grant myself a paid
     * membership" into a single authenticated request on the live site.
     */
    describe("with the mock flag set on a production build", () => {
      // NODE_ENV is typed readonly, so it is set through the record itself.
      const env = process.env as Record<string, string | undefined>;
      const realNodeEnv = env.NODE_ENV;

      beforeEach(() => {
        env.NODE_ENV = "production";
      });

      afterEach(() => {
        env.NODE_ENV = realNodeEnv;
      });

      it("does not hand out a membership from a mock checkout session", async () => {
        process.env.STRIPE_MOCK_MODE = "true";

        await expect(
          caller().stripe.createCheckoutSession({ returnUrl: RETURN_URL }),
        ).rejects.toThrow(/unavailable/i);

        // No payment row, no membership.
        expect(mockInsert).not.toHaveBeenCalled();
      });

      it("does not hand out a mock client secret", async () => {
        process.env.STRIPE_MOCK_MODE = "true";

        await expect(caller().stripe.createPaymentIntent()).rejects.toThrow(
          /unavailable/i,
        );
      });
    });
  });

  describe("input and account preconditions", () => {
    it("rejects a return URL that is not a URL", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      await expect(
        caller().stripe.createCheckoutSession({ returnUrl: "not-a-url" }),
      ).rejects.toThrow();
    });

    it("refuses checkout for a user with no email on file", async () => {
      process.env.STRIPE_MOCK_MODE = "true";
      mockFindFirst.mockImplementation((table) =>
        table === "users" ? { id: USER, email: null, name: "No Email" } : undefined,
      );

      await expect(
        caller().stripe.createCheckoutSession({ returnUrl: RETURN_URL }),
      ).rejects.toThrow(/email address/i);
    });

    it("requires a signed-in user", async () => {
      process.env.STRIPE_MOCK_MODE = "true";
      const anonymous = appRouter.createCaller({
        db,
        session: null,
        userId: undefined,
        cache,
        clientIp: "127.0.0.1",
        req: { headers: { get: () => null } },
      } as any);

      await expect(
        anonymous.stripe.createCheckoutSession({ returnUrl: RETURN_URL }),
      ).rejects.toThrow();
    });
  });

  /**
   * What a payment made outside the portal buys.
   *
   * A payment link or a Dashboard charge carries no metadata saying what it
   * was for, and the checkout-session branch of the webhook has no
   * `metadata.type` gate — so before this, every such session under the
   * ceiling granted a full year, because an absent `plan` reads as "annual".
   * A $1 link bought a membership, and so did any unrelated Checkout Session
   * on the account belonging to someone with an account here.
   */
  describe("what an outside payment buys", () => {
    it("grants the year for the annual price", () => {
      expect(entitlementForCents(MEMBERSHIP_CENTS)).toEqual({
        plan: "annual",
        bootcamp: false,
        addOnOnly: false,
      });
    });

    it("grants a semester for the semester price", () => {
      expect(entitlementForCents(SEMESTER_MEMBERSHIP_CENTS)).toEqual({
        plan: "semester",
        bootcamp: false,
        addOnOnly: false,
      });
    });

    it("grants the year plus the bootcamp for the bundle price", () => {
      expect(
        entitlementForCents(MEMBERSHIP_CENTS + BOOTCAMP_ADDON_CENTS),
      ).toEqual({ plan: "annual", bootcamp: true, addOnOnly: false });
    });

    it("grants the bootcamp alone for the add-on price, never a year", () => {
      const entitlement = entitlementForCents(BOOTCAMP_ADDON_CENTS);

      expect(entitlement?.bootcamp).toBe(true);
      // The whole point of the flag: $10 must not buy a membership year.
      expect(entitlement?.addOnOnly).toBe(true);
    });

    it("grants nothing for an amount we do not sell", () => {
      expect(entitlementForCents(100)).toBeNull();
      expect(entitlementForCents(2000)).toBeNull();
      expect(entitlementForCents(9999)).toBeNull();
    });

    it("grants nothing when the amount is absent", () => {
      expect(entitlementForCents(null)).toBeNull();
      expect(entitlementForCents(undefined)).toBeNull();
    });

    /**
     * A semester plus the add-on costs exactly what a year costs, so an
     * outside payment of that amount is genuinely ambiguous. It resolves to
     * the year — the reading that cannot short-change someone who did buy one.
     */
    it("reads the ambiguous amount as the year rather than semester plus add-on", () => {
      expect(SEMESTER_MEMBERSHIP_CENTS + BOOTCAMP_ADDON_CENTS).toBe(
        MEMBERSHIP_CENTS,
      );
      expect(entitlementForCents(MEMBERSHIP_CENTS)?.plan).toBe("annual");
    });
  });

  describe("membership price", () => {
    const insertedAmount = () =>
      (
        mockInsert.mock.calls.flat(2).find(
          (arg: any) => arg && typeof arg === "object" && "amountTotal" in arg,
        ) as { amountTotal?: number } | undefined
      )?.amountTotal;

    it("records the membership price for a mock payment", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      await caller().stripe.createCheckoutSession({ returnUrl: RETURN_URL });

      // Reads from the shared pricing module rather than a literal, so this
      // cannot drift from what the portal quotes the way $15 vs $25 once did.
      expect(insertedAmount()).toBe(MEMBERSHIP_CENTS);
    });

    it("adds the bootcamp fee on top when it is requested", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      await caller().stripe.createCheckoutSession({
        returnUrl: RETURN_URL,
        bootcamp: true,
      });

      expect(insertedAmount()).toBe(MEMBERSHIP_CENTS + BOOTCAMP_ADDON_CENTS);
    });

    it("charges the semester price for the semester plan", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      await caller().stripe.createCheckoutSession({
        returnUrl: RETURN_URL,
        plan: "semester",
      });

      expect(insertedAmount()).toBe(SEMESTER_MEMBERSHIP_CENTS);
    });

    // The add-on is a flat fee on either plan — the bootcamp runs one semester
    // whichever membership is underneath it.
    it("adds the same bootcamp fee on top of the semester plan", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      const result = await caller().stripe.createPaymentIntent({
        bootcamp: true,
        plan: "semester",
      });

      expect(result.amount).toBe(
        SEMESTER_MEMBERSHIP_CENTS + BOOTCAMP_ADDON_CENTS,
      );
    });

    // $15 must not buy the year $25 buys.
    it("grants a semester, not a year, when the semester plan is bought", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      const { mockPaymentIntentId } = await caller().stripe.createPaymentIntent(
        { plan: "semester" },
      );

      expect(mockPaymentIntentId).toMatch(/^pi_mock_sem_/);

      await caller().stripe.confirmMembershipAfterPayment({
        paymentIntentId: mockPaymentIntentId!,
      });

      const granted = mockInsert.mock.calls
        .flat(2)
        .find(
          (arg: any) =>
            arg && typeof arg === "object" && "membershipEndDate" in arg,
        ) as { membershipEndDate?: Date } | undefined;

      expect(granted?.membershipEndDate).toBeInstanceOf(Date);
      expect(granted!.membershipEndDate!.getTime()).toBeLessThan(
        Date.now() + 365 * 24 * 60 * 60 * 1000,
      );
    });
  });

  // Add-on or bundle is decided from the caller's own membership row, never
  // an input — otherwise a non-member buys bootcamp access for $10.
  describe("bootcamp add-on for an existing member", () => {
    const recordedAmount = () =>
      (
        mockInsert.mock.calls.flat(2).find(
          (arg: any) => arg && typeof arg === "object" && "amountTotal" in arg,
        ) as { amountTotal?: number } | undefined
      )?.amountTotal;

    const withMembership = (membershipEndDate: Date | null) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "users")
          return { id: USER, email: "member@gatech.edu", name: "Buzz Member" };
        if (table === "members")
          return {
            id: "member_row",
            userId: USER,
            isActive: !!membershipEndDate,
            membershipEndDate,
            renewalCount: 1,
            bootcampMember: false,
            bootcampTerm: null,
          };
        return undefined;
      });
    };

    const YEAR_LEFT = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);

    it("charges the add-on alone when the year is still running", async () => {
      process.env.STRIPE_MOCK_MODE = "true";
      withMembership(YEAR_LEFT);

      const result = await caller().stripe.createPaymentIntent({
        bootcamp: true,
      });

      expect(result.addOnOnly).toBe(true);
      expect(result.amount).toBe(BOOTCAMP_ADDON_CENTS);
    });

    it("charges the bundle when the caller is not a member", async () => {
      process.env.STRIPE_MOCK_MODE = "true";

      const result = await caller().stripe.createPaymentIntent({
        bootcamp: true,
      });

      expect(result.addOnOnly).toBe(false);
      expect(result.amount).toBe(MEMBERSHIP_CENTS + BOOTCAMP_ADDON_CENTS);
    });

    // A lapsed member is buying their way back in, so they owe the year too.
    it("charges the bundle when the membership has run out", async () => {
      process.env.STRIPE_MOCK_MODE = "true";
      withMembership(new Date(Date.now() - 24 * 60 * 60 * 1000));

      const result = await caller().stripe.createPaymentIntent({
        bootcamp: true,
      });

      expect(result.addOnOnly).toBe(false);
      expect(result.amount).toBe(MEMBERSHIP_CENTS + BOOTCAMP_ADDON_CENTS);
    });

    // The whole bug: $10 buys a semester, not a second year.
    it("stamps the term without extending the membership", async () => {
      process.env.STRIPE_MOCK_MODE = "true";
      withMembership(YEAR_LEFT);

      const { mockPaymentIntentId } = await caller().stripe.createPaymentIntent(
        { bootcamp: true },
      );

      expect(mockPaymentIntentId).toMatch(/^pi_mock_addon_/);

      await caller().stripe.confirmMembershipAfterPayment({
        paymentIntentId: mockPaymentIntentId!,
      });

      const stamped = mockUpdateSet.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .find((values) => "bootcampTerm" in values);

      expect(stamped).toBeDefined();
      expect(stamped?.bootcampMember).toBe(true);
      expect(stamped?.membershipEndDate).toBeUndefined();
      expect(stamped?.renewalCount).toBeUndefined();

      // And the $10 is what got recorded, not $35.
      expect(recordedAmount()).toBe(BOOTCAMP_ADDON_CENTS);
    });
  });

  /**
   * Reported by review on #316, and correct.
   *
   * The webhook records the payment first and grants the membership after, so
   * a grant that throws leaves a payment row linked to the user with no
   * membership behind it. Every recovery path skipped already-linked payments,
   * which made that state permanent: charged customer, payment on file,
   * nothing ever retrying.
   */
  describe("recovering a payment whose membership grant failed", () => {
    const PAID_AT = new Date("2026-03-01T12:00:00Z");

    const paidIntent = {
      id: "pi_stranded",
      amount: MEMBERSHIP_CENTS,
      currency: "usd",
      status: "succeeded",
      metadata: { type: "membership", userId: USER },
    };

    const wire = (opts: { history?: unknown }) => {
      process.env.STRIPE_SECRET_KEY = "sk_test_abc";
      mockSearchResults.mockReturnValue([paidIntent]);
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "users")
          return { id: USER, email: "member@gatech.edu", name: "Buzz Member" };
        if (table === "stripePayments")
          return {
            id: "pay_1",
            stripePaymentIntentId: paidIntent.id,
            linkedUserId: USER,
            paymentStatus: "paid",
            createdAt: PAID_AT,
          };
        if (table === "members") return { id: "member_1" };
        if (table === "membershipHistory") return opts.history;
        return undefined;
      });
    };

    it("grants the membership when no history row covers the payment", async () => {
      wire({ history: undefined });

      const res = await caller().stripe.reconcileMyPayments();

      expect(res.recovered).toBe(1);
      // A member row already exists (the profile), so the term is written as a
      // renewal — what matters is that a history row records the grant at all.
      const written = mockInsert.mock.calls.map((c) => c[0]?.[0]);
      expect(
        written.some((row) => row?.action === "renewed" || row?.action === "joined"),
      ).toBe(true);
    });

    /**
     * The other half of the rule: a membership granted a year ago and since
     * lapsed must NOT be silently renewed off that old payment. The history row
     * is what distinguishes "never honoured" from "honoured and expired".
     */
    it("leaves an already-honoured payment alone", async () => {
      wire({ history: { id: "hist_1" } });

      const res = await caller().stripe.reconcileMyPayments();

      expect(res.recovered).toBe(0);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
