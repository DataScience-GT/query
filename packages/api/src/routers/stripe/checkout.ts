// Taking a membership payment: Checkout Session, PaymentIntent and the confirm step.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc";
import { members, stripePayments } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq, and, isNull } from "drizzle-orm";
import { logSecurityEvent } from "../../middleware/security";
import {
  createOrUpdateMembership,
  readPlan,
  BOOTCAMP_ADDON_PAYMENT_TYPE,
} from "@query/db/services/membership";
import {
  priceForCents,
  formatCents,
  BOOTCAMP_ADDON_CENTS,
  MAX_MEMBERSHIP_CHARGE_CENTS,
} from "../../services/pricing";
import {
  paymentIntents,
  membershipGrants,
  membershipGrantFailures,
} from "../../services/metrics";
import crypto from "crypto";
import {
  planInput,
  planLabel,
  isMockMode,
  assertKeyModesMatch,
  describeKeyProblem,
  getStripe,
  clearMembershipCaches,
} from "./client";

export const checkoutProcedures = {
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
        .prefault({}),
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
          publishableKey:
            process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "pk_test_mock",
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
          message:
            "Payment service is temporarily unavailable. Please try again later.",
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
            type: mockAddOn ? BOOTCAMP_ADDON_PAYMENT_TYPE : "membership",
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

      // Only an intent this server minted for this caller, for a membership or
      // the add-on, within the membership ceiling — the same gate the webhook
      // and reconcileMyPayments apply. An intent with no userId (hosted
      // Checkout, a payment link, a Dashboard charge) used to pass, and
      // readPlan(undefined) granted a full year for whatever it cost.
      const paymentType = pi.metadata?.type;
      if (
        pi.metadata?.userId !== ctx.userId ||
        (paymentType !== "membership" &&
          paymentType !== BOOTCAMP_ADDON_PAYMENT_TYPE) ||
        pi.amount > MAX_MEMBERSHIP_CHARGE_CENTS
      ) {
        logSecurityEvent({
          type: "validation_error",
          identifier: ctx.userId ?? "unknown",
          details: `PaymentIntent refused: userId=${pi.metadata?.userId ?? "none"} type=${paymentType ?? "none"} amount=${pi.amount}`,
        });
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Payment mismatch.",
        });
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
          const granted = await ctx.db!.transaction(async (tx) => {
            // The webhook records the same intent under the same session id. If
            // it lands between the read above and this insert, it has already
            // granted: skip rather than surface the unique violation as a 500.
            const [inserted] = await tx
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
              .onConflictDoNothing()
              .returning({ id: stripePayments.id });
            if (!inserted) return false;

            await createOrUpdateMembership(tx as unknown as DrizzleDB, {
              userId: ctx.userId!,
              firstName,
              lastName,
              bootcampMember,
              addOnOnly,
              plan,
            });
            return true;
          });

          if (granted) membershipGrants.inc({ source: "confirm", plan });
        } else if (!existing.linkedUserId) {
          // Payment exists but wasn't linked — link it now. The link is the claim:
          // a double submit must not grant twice, and every grant extends from the
          // current end date, so a second one is a free year.
          const granted = await ctx.db!.transaction(async (tx) => {
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
            if (claimed.rowCount === 0) return false;

            await createOrUpdateMembership(tx as unknown as DrizzleDB, {
              userId: ctx.userId!,
              firstName,
              lastName,
              bootcampMember,
              addOnOnly,
              plan,
            });
            return true;
          });

          if (granted) membershipGrants.inc({ source: "confirm", plan });
        }
      } catch (error) {
        membershipGrantFailures.inc({ source: "confirm" });
        throw error;
      }

      clearMembershipCaches(ctx.cache, ctx.userId!);

      return { success: true };
    }),
};
