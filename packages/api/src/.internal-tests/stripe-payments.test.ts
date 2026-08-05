import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db } from "@query/db";
import { MEMBERSHIP_CENTS, BOOTCAMP_ADDON_CENTS } from "../services/pricing";

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
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
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

      expect(result).toEqual({
        clientSecret: "mock_pi_secret",
        publishableKey: "pk_test_local",
        isMock: true,
      });
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
  });
});
