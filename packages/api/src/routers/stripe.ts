import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  members,
  membershipHistory,
  stripePayments,
  userAccountLinks,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq, and, gte, isNull } from "drizzle-orm";
import { logSecurityEvent } from "../middleware/security";
import { clearMembershipCaches as clearMembershipCachesFor } from "../middleware/cache";
import {
  createOrUpdateMembership,
  paidForBootcamp,
  isBootcampAddOnOnly,
  planFromMetadata,
  readPlan,
  BOOTCAMP_ADDON_PAYMENT_TYPE,
} from "@query/db/services/membership";
import {
  priceForCents,
  formatCents,
  BOOTCAMP_ADDON_CENTS,
  MAX_MEMBERSHIP_CHARGE_CENTS,
} from "../services/pricing";
import {
  paymentIntents,
  membershipGrants,
  membershipGrantFailures,
  paymentsRecovered,
} from "../services/metrics";
import type Stripe from "stripe";
import crypto from "crypto";

// Caches the Stripe client against the key it was built from. Two loose
// variables let them drift, and a client cached under a stale key talks to
// the wrong Stripe account.
class StripeClientProvider {
  private client: Stripe | null = null;
  private builtFromKey: string | undefined;

  // Only a constructed client is memoized, and only for its key. One call made
  // before the environment was populated used to cache `null` for the life of
  // the process, so every later request said "payment service unavailable"
  // until a restart.
  async get(): Promise<Stripe | null> {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    if (this.client && this.builtFromKey === key) return this.client;

    const { default: StripeSDK } = await import("stripe");
    this.client = new StripeSDK(key);
    this.builtFromKey = key;
    return this.client;
  }
}

const stripeClients = new StripeClientProvider();

/** Both plans buy the same membership; only the expiry differs. */
const planInput = z.enum(["annual", "semester"]).default("annual");

const planLabel = (plan: "annual" | "semester") =>
  plan === "semester" ? "one semester" : "one year";

// Mock mode records a paid payment and activates a membership with no money
// moving. Switched on by an explicit flag, never a key prefix: the old `mk_`
// prefix looked enough like a credential to get committed and shipped, which
// silently put the live site into mock mode. `next build`/`next start` set
// NODE_ENV=production, where the flag is ignored, so production fails closed.
const isMockMode = () =>
  process.env.STRIPE_MOCK_MODE === "true" &&
  process.env.NODE_ENV !== "production";

// Secret and publishable keys must be the same Stripe mode. An intent minted
// with a test secret cannot be confirmed by a live publishable key, and
// Stripe.js reports that as a vague client-side error with no hint that the
// two disagree — easy to hit when only one is swapped.
const assertKeyModesMatch = (secretKey: string) => {
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!publishable) return;

  // Restricted keys (rk_live_/rk_test_) are the recommended kind, so matching
  // only `sk_` would read a live restricted key as test mode and refuse
  // payments.
  const secretIsLive = /^[sr]k_live/.test(secretKey);
  const publishableIsLive = publishable.startsWith("pk_live");

  if (secretIsLive !== publishableIsLive) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Payment service is misconfigured: the Stripe secret and publishable keys are for different modes (live vs test).",
    });
  }
};

// Why payments are unavailable, for the server log. The member-facing string
// is useless to whoever has to fix it — a missing key and a mock key in
// production look identical. Names the cause without logging key material.
const describeKeyProblem = (key: string | undefined) => {
  if (!key) return "STRIPE_SECRET_KEY is not set on this deployment";
  return null;
};

const getStripe = (): Promise<Stripe | null> => stripeClients.get();

// Shared with the Stripe webhook so both paths evict the identical key set.
function clearMembershipCaches(_cache: unknown, userId: string) {
  clearMembershipCachesFor(userId);
}

export const stripeRouter = createTRPCRouter({
  // Create a new Stripe Checkout Session for membership.
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        returnUrl: z.string().url(),
        bootcamp: z.boolean().default(false),
        plan: planInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db!.query.users.findFirst({
        where: eq((await import("@query/db")).users.id, ctx.userId!),
      });

      if (!user?.email) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User must have an email address to checkout.",
        });
      }

      // Checked before the key, so local development needs no Stripe key at all —
      // which is the point: no reason left to invent a placeholder credential.
      if (isMockMode()) {
        const sessionId = `cs_mock_${crypto.randomUUID().replace(/-/g, "")}`;
        const nameParts = (user.name || "Member").split(" ");
        const firstName = nameParts[0] || "Member";
        const lastName = nameParts.slice(1).join(" ") || "Member";
        const bootcampMember = input.bootcamp;

        await ctx.db!.transaction(async (tx) => {
          await tx.insert(stripePayments).values({
            stripeSessionId: sessionId,
            stripeCustomerId: "cus_mock_123",
            stripePaymentIntentId: "pi_mock_123",
            customerEmail: user.email!.toLowerCase(),
            customerName: user.name || "Member",
            amountTotal: priceForCents(input.bootcamp, input.plan),
            currency: "usd",
            paymentStatus: "paid",
            linkedUserId: ctx.userId!,
            linkedAt: new Date(),
            metadata: JSON.stringify({
              userId: ctx.userId!,
              bootcamp: input.bootcamp ? "true" : "false",
              plan: input.plan,
            }),
          });

          await createOrUpdateMembership(tx as unknown as DrizzleDB, {
            userId: ctx.userId!,
            firstName,
            lastName,
            bootcampMember,
            plan: input.plan,
          });
        });

        // Invalidate cache
        clearMembershipCaches(ctx.cache, ctx.userId!);

        const mockUrl = `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}payment=success&session_id=${sessionId}`;
        return { url: mockUrl };
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `Stripe unavailable: ${describeKeyProblem(stripeKey) ?? "unknown cause"}`,
        });
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Payment service is currently unavailable. Please try again later.",
        });
      }

      assertKeyModesMatch(stripeKey);

      const stripe = await getStripe();
      if (!stripe) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `Stripe unavailable: ${describeKeyProblem(process.env.STRIPE_SECRET_KEY) ?? "unknown cause"}`,
        });
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Payment service is currently unavailable. Please try again later.",
        });
      }

      try {
        const session = await stripe.checkout.sessions.create({
          // No payment_method_types on purpose: pinning it to card disables dynamic
          // payment methods, so Link, Cash App and wallets never appear at checkout.
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: input.bootcamp
                    ? "DSGT Membership + Bootcamp"
                    : "DSGT Membership",
                  description: input.bootcamp
                    ? `Membership to Data Science at Georgia Tech for ${planLabel(input.plan)}, including bootcamp access`
                    : `Membership to Data Science at Georgia Tech for ${planLabel(input.plan)}`,
                },
                // From the shared pricing module, so this cannot drift from what
                // createPaymentIntent charges or the portal quotes.
                unit_amount: priceForCents(input.bootcamp, input.plan),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${input.returnUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${input.returnUrl}?payment=cancelled`,
          customer_email: user.email,
          metadata: {
            userId: ctx.userId!,
            bootcamp: input.bootcamp ? "true" : "false",
            // Read back by the webhook: what expiry was paid for is decided here, never
            // by whatever the browser claims later.
            plan: input.plan,
          },
        });

        return { url: session.url };
      } catch (error: unknown) {
        // Generic error for every Stripe failure — the response must not leak
        // whether the key is missing, invalid or in the wrong mode.
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `Stripe error: ${error}`,
        });
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Payment service is temporarily unavailable. Please try again later.",
        });
      }
    }),

  // Create a PaymentIntent for embedded/modal checkout. Returns the
  // client_secret for the Stripe Payment Element.
  createPaymentIntent: protectedProcedure
    .input(
      z
        .object({ bootcamp: z.boolean().default(false), plan: planInput })
        .default({}),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db!.query.users.findFirst({
        where: eq((await import("@query/db")).users.id, ctx.userId!),
      });

      if (!user?.email) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User must have an email address to checkout.",
        });
      }

      // A member with a year still on it buys the bootcamp alone. Decided from
      // their own row, never an input flag — otherwise a non-member could ask for
      // add-on pricing and get bootcamp access for $10.
      const member = await ctx.db!.query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
        columns: { isActive: true, membershipEndDate: true },
      });
      const membershipActive = !!(
        member?.isActive &&
        member.membershipEndDate &&
        member.membershipEndDate > new Date()
      );
      const addOnOnly = input.bootcamp && membershipActive;
      const amount = addOnOnly
        ? BOOTCAMP_ADDON_CENTS
        : priceForCents(input.bootcamp, input.plan);

      // Counted where the price is decided, so the dashboard's plan mix is what the
      // server charged rather than what a client asked for.
      paymentIntents.inc({
        plan: input.plan,
        bootcamp: String(input.bootcamp),
        addon_only: String(addOnOnly),
      });

      // Checked before the key, matching createCheckoutSession, so local
      // development needs no Stripe key.
      if (isMockMode()) {
        // A real, unique id so the mock flow goes through the same
        // confirmMembershipAfterPayment path production uses, idempotency check
        // included. A fixed placeholder would collide across runs and make the second
        // developer's payment a silent no-op.
        return {
          clientSecret: "mock_pi_secret",
          // Purchase kind rides in the id: a mock intent is stored nowhere for confirm
          // to look up, so otherwise only the bundle is testable. The plan rides along
          // too — a mock semester purchase granting a year would hide the bug.
          mockPaymentIntentId: `pi_mock_${addOnOnly ? "addon_" : input.plan === "semester" ? "sem_" : ""}${crypto.randomUUID().replace(/-/g, "")}`,
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "pk_test_mock",
          isMock: true,
          amount,
          addOnOnly,
        };
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `Stripe unavailable: ${describeKeyProblem(stripeKey) ?? "unknown cause"}`,
        });
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Payment service is currently unavailable. Please try again later.",
        });
      }

      assertKeyModesMatch(stripeKey);

      const stripe = await getStripe();
      if (!stripe) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `Stripe unavailable: ${describeKeyProblem(process.env.STRIPE_SECRET_KEY) ?? "unknown cause"}`,
        });
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Payment service is currently unavailable. Please try again later.",
        });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          receipt_email: user.email,
          description: addOnOnly
            ? `DSGT Bootcamp — one semester (${formatCents(amount)})`
            : input.bootcamp
              ? `DSGT Membership (${planLabel(input.plan)}) + Bootcamp (${formatCents(amount)})`
              : `DSGT Membership — ${planLabel(input.plan)} (${formatCents(amount)})`,
          metadata: {
            userId: ctx.userId!,
            userEmail: user.email,
            // Every grant path reads this to tell a $10 add-on from a year.
            type: addOnOnly ? BOOTCAMP_ADDON_PAYMENT_TYPE : "membership",
            // And this to tell a year from a semester. The add-on extends neither, so it
            // carries the default and is ignored.
            plan: input.plan,
            // Read back when the payment is recorded, so the bootcamp flag comes from
            // what was charged rather than from a client that could claim it.
            bootcamp: input.bootcamp ? "true" : "false",
          },
          automatic_payment_methods: { enabled: true },
        });

        return {
          clientSecret: paymentIntent.client_secret!,
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
          isMock: false,
          amount,
          addOnOnly,
        };
      } catch (error: unknown) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `Stripe PaymentIntent error: ${error}`,
        });
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Payment service is temporarily unavailable. Please try again later.",
        });
      }
    }),

  // Called by the frontend after the PaymentIntent succeeds client-side.
  // Verifies with Stripe, records the payment, activates the membership.
  confirmMembershipAfterPayment: protectedProcedure
    .input(z.object({ paymentIntentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Mock mode grants through this same procedure rather than a parallel branch,
      // so local development exercises the production path — same idempotency
      // check, membership service and cache eviction. isMockMode() is false
      // whenever NODE_ENV=production, so this cannot mint free live memberships.
      const mock = isMockMode() && input.paymentIntentId.startsWith("pi_mock_");

      // Only the fields this procedure reads. Structural rather than Stripe's own
      // type so the mock object can satisfy it without inventing a hundred
      // properties.
      let pi: {
        id: string;
        status: string;
        amount: number;
        currency: string;
        customer?: string | { id: string } | null;
        receipt_email?: string | null;
        metadata?: Record<string, string>;
      };

      if (mock) {
        // createPaymentIntent encodes the purchase in the mock id.
        const mockAddOn = input.paymentIntentId.startsWith("pi_mock_addon_");
        const mockPlan = input.paymentIntentId.startsWith("pi_mock_sem_")
          ? "semester"
          : "annual";
        pi = {
          id: input.paymentIntentId,
          status: "succeeded",
          amount: mockAddOn
            ? BOOTCAMP_ADDON_CENTS
            : priceForCents(false, mockPlan),
          currency: "usd",
          metadata: {
            userId: ctx.userId!,
            bootcamp: mockAddOn ? "true" : "false",
            plan: mockPlan,
            ...(mockAddOn ? { type: BOOTCAMP_ADDON_PAYMENT_TYPE } : {}),
          },
        };
      } else {
        // No key-mode check here: this path hands no publishable key to the client,
        // so the two cannot disagree.
        const stripe = await getStripe();
        if (!stripe) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Payment service unavailable.",
          });
        }

        // Verify with Stripe that payment actually succeeded
        pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
      }

      if (pi.status !== "succeeded") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payment not yet complete (status: ${pi.status}). Please wait and try again.`,
        });
      }

      // Ensure the intent was for this user (guard against replay attacks)
      if (pi.metadata?.userId && pi.metadata.userId !== ctx.userId) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `PaymentIntent userId mismatch: ${pi.metadata.userId} vs ${ctx.userId}`,
        });
        throw new TRPCError({ code: "FORBIDDEN", message: "Payment mismatch." });
      }

      const user = await ctx.db!.query.users.findFirst({
        where: eq((await import("@query/db")).users.id, ctx.userId!),
      });

      const nameParts = (user?.name || "Member").split(" ");
      const firstName = nameParts[0] ?? "Member";
      const lastName = nameParts.slice(1).join(" ") || "Member";
      // From the charged intent, not the client: the add-on is granted only if it
      // was actually paid for.
      const bootcampMember = pi.metadata?.bootcamp === "true";
      const addOnOnly = pi.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE;
      const plan = readPlan(pi.metadata?.plan);

      // Check if already processed (idempotent)
      const existing = await ctx.db!.query.stripePayments.findFirst({
        where: eq(stripePayments.stripePaymentIntentId, pi.id),
      });

      // A grant that throws leaves a recorded payment and no membership. Reconcile
      // can repair it, but only once somebody knows to look — so count the failure
      // rather than only logging it.
      try {
        if (!existing) {
          await ctx.db!.transaction(async (tx) => {
            await tx.insert(stripePayments).values({
              stripeSessionId: `pi_${pi.id}`,
              stripeCustomerId: typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? ""),
              stripePaymentIntentId: pi.id,
              customerEmail: (pi.receipt_email ?? user?.email ?? "").toLowerCase(),
              customerName: user?.name ?? "Member",
              amountTotal: pi.amount,
              currency: pi.currency,
              paymentStatus: "paid",
              linkedUserId: ctx.userId!,
              linkedAt: new Date(),
              metadata: JSON.stringify(pi.metadata ?? {}),
            });

            await createOrUpdateMembership(tx as unknown as DrizzleDB, {
              userId: ctx.userId!,
              firstName,
              lastName,
              bootcampMember,
              addOnOnly,
              plan,
            });
          });

          membershipGrants.inc({ source: "confirm", plan });
        } else if (!existing.linkedUserId) {
          // Payment exists but wasn't linked — link it now
          await ctx.db!.update(stripePayments)
            .set({ linkedUserId: ctx.userId!, linkedAt: new Date(), updatedAt: new Date() })
            .where(eq(stripePayments.id, existing.id));
          await createOrUpdateMembership(ctx.db! as DrizzleDB, { userId: ctx.userId!, firstName, lastName, bootcampMember, addOnOnly, plan });

          membershipGrants.inc({ source: "confirm", plan });
        }
      } catch (error) {
        membershipGrantFailures.inc({ source: "confirm" });
        throw error;
      }

      clearMembershipCaches(ctx.cache, ctx.userId!);

      return { success: true };
    }),


  // Auto-link a Stripe payment matching the user's email.
  attemptAutoLink: protectedProcedure.mutation(async ({ ctx }) => {
    // Basic rate limit to prevent loop hammering (max 1 request per 10 seconds per user)
    const rateLimitKey = `rl:autolink:${ctx.userId!}`;
    if (ctx.cache.get(rateLimitKey)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please wait a moment before trying again.",
      });
    }
    ctx.cache.set(rateLimitKey, true, 10);

    return await ctx.db!.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        where: eq((await import("@query/db")).users.id, ctx.userId!),
      });

      if (!user?.email) return { success: false };

      const payment = await tx.query.stripePayments.findFirst({
        where: and(
          eq(stripePayments.customerEmail, user.email),
          isNull(stripePayments.linkedUserId),
          eq(stripePayments.paymentStatus, "paid"),
        ),
      });

      if (!payment) return { success: false };

      // Verify not already linked (double check)
      const existingLink = await tx.query.userAccountLinks.findFirst({
        where: eq(userAccountLinks.userId, ctx.userId!),
      });
      if (existingLink) return { success: true };

      const names = (user.name || "Member").split(" ");
      const firstName = names[0] || "Member";
      const lastName = names.slice(1).join(" ") || "Member";
      const bootcampMember = paidForBootcamp(payment.metadata);
      const addOnOnly = isBootcampAddOnOnly(payment.metadata);
      const plan = planFromMetadata(payment.metadata);

      await tx.insert(userAccountLinks).values({
        userId: ctx.userId!,
        stripePaymentId: payment.id,
        providedFirstName: firstName,
        providedLastName: lastName,
        providedEmail: user.email,
      });

      await tx
        .update(stripePayments)
        .set({
          linkedUserId: ctx.userId!,
          linkedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(stripePayments.id, payment.id));

      await createOrUpdateMembership(tx as unknown as DrizzleDB, {
            userId: ctx.userId!,
            firstName,
            lastName,
            bootcampMember,
            addOnOnly,
            plan,
          });

      membershipGrants.inc({ source: "autolink", plan });
      clearMembershipCaches(ctx.cache, ctx.userId!);

      return { success: true };
    });
  }),

  // Whether the current user has an unlinked Stripe payment matching their
  // email (the auto-link case).
  // Recovers membership payments Stripe took but this app never recorded. The
  // portal records a charge when the browser calls confirmMembershipAfterPayment
  // — if that never lands (tab closed, instance restarted) the money is gone
  // and nothing here knows. The webhook is the usual backstop but depends on a
  // Dashboard subscription this repo cannot guarantee. So ask Stripe directly:
  // any succeeded membership intent carrying this user's id with no row here is
  // recorded and granted. Keyed on the intent id, so it is safe on every load.
  reconcileMyPayments: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = await getStripe();
    if (!stripe) return { recovered: 0 };

    const user = await ctx.db!.query.users.findFirst({
      where: eq(users.id, ctx.userId!),
    });

    let found;
    try {
      // Scoped by metadata to this user, so it can only recover their own payments.
      // Stripe's search index lags writes by up to a minute, fine for a backstop.
      found = await stripe.paymentIntents.search({
        query: `metadata['userId']:'${ctx.userId}' AND status:'succeeded'`,
        limit: 20,
      });
    } catch {
      // Search is unavailable on some accounts and versions; a failed backstop must
      // not break the page that called it.
      return { recovered: 0 };
    }

    let recovered = 0;

    for (const pi of found.data) {
      if (pi.metadata?.type !== "membership") continue;
      if (pi.metadata?.userId !== ctx.userId) continue;
      // Same ceiling the webhook applies, so the two paths cannot disagree about
      // which charges are memberships.
      if (pi.amount > MAX_MEMBERSHIP_CHARGE_CENTS) continue;

      const existing = await ctx.db!.query.stripePayments.findFirst({
        where: eq(stripePayments.stripePaymentIntentId, pi.id),
      });

      // A row that exists but was never linked is the half-finished state this is
      // here to repair — treating "row exists" as "done" would strand it.
      if (existing) {
        // Somebody else's payment. Not ours to touch.
        if (existing.linkedUserId && existing.linkedUserId !== ctx.userId) {
          continue;
        }

        // Linked to this user is NOT proof the membership was granted. The webhook
        // records the payment first and grants afterwards on purpose — sharing a
        // transaction meant a failed grant rolled the payment back and lost the
        // charge — so linked-with-no-membership is a real state, and skipping every
        // linked payment made it permanent. membership_history tells them apart:
        // every grant writes a row, so a payment with no history row at or after its
        // own timestamp was never honoured. That also keeps a membership granted a
        // year ago and since lapsed from being silently renewed off an old payment.
        if (existing.linkedUserId) {
          const member = await ctx.db!.query.members.findFirst({
            where: eq(members.userId, ctx.userId!),
            columns: { id: true },
          });

          const honoured = member
            ? await ctx.db!.query.membershipHistory.findFirst({
                where: and(
                  eq(membershipHistory.memberId, member.id),
                  gte(membershipHistory.createdAt, existing.createdAt),
                ),
                columns: { id: true },
              })
            : undefined;

          if (honoured) continue;

          const parts = (user?.name || "Member").trim().split(/\s+/);
          await createOrUpdateMembership(ctx.db! as DrizzleDB, {
            userId: ctx.userId!,
            firstName: parts[0] || "Member",
            lastName: parts.slice(1).join(" ") || "Member",
            bootcampMember: pi.metadata?.bootcamp === "true",
            addOnOnly: pi.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE,
            plan: readPlan(pi.metadata?.plan),
          });
          recovered += 1;
          continue;
        }

        await ctx.db!.transaction(async (tx) => {
          const claimed = await tx
            .update(stripePayments)
            .set({
              linkedUserId: ctx.userId!,
              linkedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(stripePayments.id, existing.id),
                isNull(stripePayments.linkedUserId),
              ),
            );

          if (claimed.rowCount === 0) return;

          const parts = (user?.name || "Member").trim().split(/\s+/);
          await createOrUpdateMembership(tx as unknown as DrizzleDB, {
            userId: ctx.userId!,
            firstName: parts[0] || "Member",
            lastName: parts.slice(1).join(" ") || "Member",
            bootcampMember: pi.metadata?.bootcamp === "true",
            addOnOnly: pi.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE,
            plan: readPlan(pi.metadata?.plan),
          });
          recovered += 1;
        });
        continue;
      }

      const bootcampMember = pi.metadata?.bootcamp === "true";
      const addOnOnly = pi.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE;
      const plan = readPlan(pi.metadata?.plan);
      const { firstName, lastName } = (() => {
        const parts = (user?.name || "Member").trim().split(/\s+/);
        return {
          firstName: parts[0] || "Member",
          lastName: parts.slice(1).join(" ") || "Member",
        };
      })();

      try {
        await ctx.db!.transaction(async (tx) => {
          // Same synthetic session id the confirm path and the webhook use, so the
          // unique on stripeSessionId settles any race between the three.
          const inserted = await tx
            .insert(stripePayments)
            .values({
              stripeSessionId: `pi_${pi.id}`,
              stripeCustomerId:
                typeof pi.customer === "string"
                  ? pi.customer
                  : (pi.customer?.id ?? ""),
              stripePaymentIntentId: pi.id,
              customerEmail: (
                pi.receipt_email ??
                user?.email ??
                ""
              ).toLowerCase(),
              customerName: user?.name ?? "Member",
              amountTotal: pi.amount,
              currency: pi.currency,
              paymentStatus: "paid",
              linkedUserId: ctx.userId!,
              linkedAt: new Date(),
              metadata: JSON.stringify(pi.metadata ?? {}),
            })
            .onConflictDoNothing({ target: stripePayments.stripeSessionId })
            .returning({ id: stripePayments.id });

          if (inserted.length === 0) return;

          await createOrUpdateMembership(tx as unknown as DrizzleDB, {
            userId: ctx.userId!,
            firstName,
            lastName,
            bootcampMember,
            addOnOnly,
            plan,
          });
          recovered += 1;
        });
      } catch (error) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `Payment reconcile failed: ${error}`,
        });
      }
    }

    if (recovered > 0) {
      // Every one of these is a charge that reached Stripe and never reached this
      // app — the backstop working means something upstream did not.
      paymentsRecovered.inc(recovered);
      membershipGrants.inc({ source: "reconcile", plan: "unknown" }, recovered);
      clearMembershipCaches(ctx.cache, ctx.userId!);
    }

    return { recovered };
  }),

  checkPendingPayment: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db!.query.users.findFirst({
      where: eq((await import("@query/db")).users.id, ctx.userId!),
    });

    if (!user?.email) {
      return { hasPendingPayment: false };
    }

    const pendingPayment = await ctx.db!.query.stripePayments.findFirst({
      where: and(
        eq(stripePayments.customerEmail, user.email),
        isNull(stripePayments.linkedUserId),
        eq(stripePayments.paymentStatus, "paid"),
      ),
    });

    return {
      hasPendingPayment: !!pendingPayment,
      paymentId: pendingPayment?.id,
    };
  }),

  // Link a Stripe payment to the current user by the name and email used at
  // checkout.
  linkAccount: protectedProcedure
    .input(
      z.object({
        // Trimmed before the length check: " " passes a bare min(1) and normalizes to
        // empty, which the ownership check below must never see.
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        email: z.string().email().max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db!.transaction(async (tx) => {
        const payment = await tx.query.stripePayments.findFirst({
          where: and(
            eq(stripePayments.customerEmail, input.email.toLowerCase()),
            isNull(stripePayments.linkedUserId),
            eq(stripePayments.paymentStatus, "paid"),
          ),
        });

        if (!payment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "No payment found with that email. Please check the email you used during checkout.",
          });
        }

        // Prove the caller is the payer. The email alone is not proof — it is the one
        // thing about someone else's payment that is easy to know — so without this
        // any signed-in user could take over a stranger's membership. Either the
        // account email matches the payer's, or the typed name matches the name on
        // the payment (which covers paying personally and signing up with a school
        // address, and payments Stripe recorded without a name).
        const account = await tx.query.users.findFirst({
          where: eq(users.id, ctx.userId!),
          columns: { email: true },
        });

        const normalize = (value: string) =>
          value.toLowerCase().replace(/\s+/g, " ").trim();

        const emailMatches =
          !!account?.email &&
          normalize(account.email) === normalize(payment.customerEmail);

        // Every word the caller gave must be a word on the payment. Whole tokens, not
        // `includes`: the empty string is a substring of every name, so a substring
        // test turns this back into "knowing the email is enough". Tokenising also
        // lets "Mary Jane Watson" match a caller who enters "Jane Watson".
        const tokensOf = (value: string) =>
          normalize(value).split(" ").filter(Boolean);

        const paymentTokens = new Set(tokensOf(payment.customerName ?? ""));
        const givenTokens = [
          ...tokensOf(input.firstName),
          ...tokensOf(input.lastName),
        ];

        const nameMatches =
          paymentTokens.size > 0 &&
          givenTokens.length >= 2 &&
          givenTokens.every((token) => paymentTokens.has(token));

        if (!emailMatches && !nameMatches) {
          logSecurityEvent({
            type: "validation_error",
            identifier: ctx.userId ?? "unknown",
            details: `Failed ownership check linking payment ${payment.id}`,
          });
          // Same message as "no payment", so this cannot be used to discover which
          // addresses have an unclaimed payment against them.
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "No payment found with that email. Please check the email you used during checkout.",
          });
        }

        const existingLink = await tx.query.userAccountLinks.findFirst({
          where: eq(userAccountLinks.stripePaymentId, payment.id),
        });

        if (existingLink) {
          logSecurityEvent({
            type: "validation_error",
            identifier: ctx.userId ?? "unknown",
            details: `Attempted to link already linked payment ${payment.id}`,
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment has already been linked to an account.",
          });
        }

        const userExistingLink = await tx.query.userAccountLinks.findFirst({
          where: eq(userAccountLinks.userId, ctx.userId!),
        });

        if (userExistingLink) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Your account is already linked to a payment.",
          });
        }

        await tx.insert(userAccountLinks).values({
          userId: ctx.userId!,
          stripePaymentId: payment.id,
          providedFirstName: input.firstName,
          providedLastName: input.lastName,
          providedEmail: input.email.toLowerCase(),
        });

        await tx
          .update(stripePayments)
          .set({
            linkedUserId: ctx.userId!,
            linkedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(stripePayments.id, payment.id));

        await createOrUpdateMembership(tx as unknown as DrizzleDB, {
          userId: ctx.userId!,
          firstName: input.firstName,
          lastName: input.lastName,
          bootcampMember: paidForBootcamp(payment.metadata),
          addOnOnly: isBootcampAddOnOnly(payment.metadata),
          plan: planFromMetadata(payment.metadata),
        });

        membershipGrants.inc({
          source: "link",
          plan: planFromMetadata(payment.metadata),
        });
        clearMembershipCaches(ctx.cache, ctx.userId!);

        return {
          success: true,
          message: "Account linked successfully! You are now a member.",
        };
      });
    }),

  // The current user's linked payment status.
  getLinkedPayment: protectedProcedure.query(async ({ ctx }) => {
    const link = await ctx.db!.query.userAccountLinks.findFirst({
      where: eq(userAccountLinks.userId, ctx.userId!),
      with: {
        stripePayment: true,
      },
    });

    if (!link) {
      return null;
    }

    return {
      linkedAt: link.createdAt,
      stripeEmail: link.stripePayment.customerEmail,
      paymentDate: link.stripePayment.createdAt,
    };
  }),
});

