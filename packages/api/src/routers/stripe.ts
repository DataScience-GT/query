import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { stripePayments, userAccountLinks, members, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq, and, isNull } from "drizzle-orm";
import { logSecurityEvent } from "../middleware/security";
import { clearMembershipCaches as clearMembershipCachesFor } from "../middleware/cache";
import { resolveHackathonId } from "../services/portal-context";
import type Stripe from "stripe";
import crypto from "crypto";

let stripeClient: Stripe | null | undefined;
let stripeClientKey: string | undefined;

/**
 * Mock mode is a local-development affordance: it records a paid payment and
 * activates a membership without any money moving. That must never be
 * reachable from a production deploy — .env.production currently carries an
 * `mk_` key, which would otherwise make "grant myself a paid membership" a
 * single authenticated request to createCheckoutSession.
 *
 * `next build`/`next start` set NODE_ENV to production, so a deploy that still
 * has a mock key now fails closed with "payment service unavailable" instead
 * of handing out memberships.
 */
const isMockMode = (key: string | undefined): key is string =>
  !!key && key.startsWith("mk_") && process.env.NODE_ENV !== "production";

async function getStripe(): Promise<Stripe | null> {
  const key = process.env.STRIPE_SECRET_KEY;

  // A mock key cannot talk to Stripe; constructing a client with it would turn
  // every call into an opaque auth error instead of a clear outage.
  if (key?.startsWith("mk_")) return null;

  // Only a successfully constructed client is memoized, and only for the key it
  // was built from. Previously a single call made before the environment was
  // populated cached `null` for the lifetime of the process, so every later
  // request returned "payment service unavailable" even once the key was
  // present — the failure was permanent and only a restart cleared it.
  if (!key) return null;
  if (stripeClient && stripeClientKey === key) return stripeClient;

  const { default: StripeSDK } = await import("stripe");
  stripeClient = new StripeSDK(key);
  stripeClientKey = key;
  return stripeClient;
}

// Shared with the Stripe webhook so both paths evict the identical key set.
function clearMembershipCaches(_cache: unknown, userId: string) {
  clearMembershipCachesFor(userId);
}

export const stripeRouter = createTRPCRouter({
  /**
   * Create a new Stripe Checkout Session for membership
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({ returnUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      // Check key presence up front — cheap, and keeps the original error
      // precedence without paying for the Stripe SDK import.
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Payment service is currently unavailable. Please try again later.",
        });
      }

      const user = await ctx.db!.query.users.findFirst({
        where: eq((await import("@query/db")).users.id, ctx.userId!),
      });

      if (!user?.email) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User must have an email address to checkout.",
        });
      }

      // Mock mode short-circuits before getStripe(), so a development key never
      // dynamically imports and instantiates the real Stripe SDK.
      if (isMockMode(stripeKey)) {
        const sessionId = `cs_mock_${crypto.randomUUID().replace(/-/g, "")}`;
        const nameParts = (user.name || "Member").split(" ");
        const firstName = nameParts[0] || "Member";
        const lastName = nameParts.slice(1).join(" ") || "Member";

        await ctx.db!.transaction(async (tx) => {
          await tx.insert(stripePayments).values({
            stripeSessionId: sessionId,
            stripeCustomerId: "cus_mock_123",
            stripePaymentIntentId: "pi_mock_123",
            customerEmail: user.email!.toLowerCase(),
            customerName: user.name || "Member",
            // $15.00, matching the live checkout line item and the portal UI.
            amountTotal: 1500,
            currency: "usd",
            paymentStatus: "paid",
            linkedUserId: ctx.userId!,
            linkedAt: new Date(),
            metadata: JSON.stringify({ userId: ctx.userId! }),
          });

          await createOrUpdateMembership(
            tx as unknown as DrizzleDB,
            ctx.userId!,
            firstName,
            lastName,
          );
        });

        // Invalidate cache
        clearMembershipCaches(ctx.cache, ctx.userId!);

        const mockUrl = `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}payment=success&session_id=${sessionId}`;
        return { url: mockUrl };
      }

      const stripe = await getStripe();
      if (!stripe) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Payment service is currently unavailable. Please try again later.",
        });
      }

      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "DSGT Membership",
                  description:
                    "One year membership to Data Science at Georgia Tech",
                  // images: ["https://example.com/logo.png"], // Optional: Add a logo if available
                },
                // $15.00 — matches createPaymentIntent (1500) and the portal UI
                // ("$15.00 / year"). This was 2500, so the hosted-checkout path
                // charged $25 for the same membership.
                unit_amount: 1500,
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
          },
        });

        return { url: session.url };
      } catch (error: unknown) {
        // Stripe Checkout Error
        // Check for invalid API key errors specifically if possible, but obscure all
        // Generic error for all Stripe failures - don't leak configuration status
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

  /**
   * Create a Stripe PaymentIntent for embedded/modal checkout
   * Returns client_secret for use with Stripe Payment Element
   */
  createPaymentIntent: protectedProcedure
    .mutation(async ({ ctx }) => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Payment service is currently unavailable. Please try again later.",
        });
      }

      const user = await ctx.db!.query.users.findFirst({
        where: eq((await import("@query/db")).users.id, ctx.userId!),
      });

      if (!user?.email) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User must have an email address to checkout.",
        });
      }

      // Dev/mock mode short-circuits before getStripe(), matching
      // createCheckoutSession. This previously ran *after* getStripe(), so a
      // mock key still constructed a real Stripe SDK instance.
      if (isMockMode(stripeKey)) {
        return {
          clientSecret: "mock_pi_secret",
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "pk_test_mock",
          isMock: true,
        };
      }

      const stripe = await getStripe();
      if (!stripe) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Payment service is currently unavailable. Please try again later.",
        });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1500, // $15.00 in cents
          currency: "usd",
          receipt_email: user.email,
          description: "DSGT Annual Membership ($15/yr)",
          metadata: {
            userId: ctx.userId!,
            userEmail: user.email,
            type: "membership",
          },
          automatic_payment_methods: { enabled: true },
        });

        return {
          clientSecret: paymentIntent.client_secret!,
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
          isMock: false,
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

  /**
   * Called by the frontend after PaymentIntent succeeds client-side.
   * Verifies with Stripe, records the payment in DB, and activates membership.
   */
  confirmMembershipAfterPayment: protectedProcedure
    .input(z.object({ paymentIntentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const stripe = await getStripe();
      if (!stripe) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Payment service unavailable.",
        });
      }

      // Verify with Stripe that payment actually succeeded
      const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
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

      // Check if already processed (idempotent)
      const existing = await ctx.db!.query.stripePayments.findFirst({
        where: eq(stripePayments.stripePaymentIntentId, pi.id),
      });

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

          await createOrUpdateMembership(
            tx as unknown as DrizzleDB,
            ctx.userId!,
            firstName,
            lastName,
          );
        });
      } else if (!existing.linkedUserId) {
        // Payment exists but wasn't linked — link it now
        await ctx.db!.update(stripePayments)
          .set({ linkedUserId: ctx.userId!, linkedAt: new Date(), updatedAt: new Date() })
          .where(eq(stripePayments.id, existing.id));
        await createOrUpdateMembership(ctx.db! as DrizzleDB, ctx.userId!, firstName, lastName);
      }

      clearMembershipCaches(ctx.cache, ctx.userId!);

      return { success: true };
    }),


  /**
   * Attempt to auto-link a Stripe payment matching the user's email
   */
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

      await createOrUpdateMembership(
        tx as unknown as DrizzleDB,
        ctx.userId!,
        firstName,
        lastName,
      );

      clearMembershipCaches(ctx.cache, ctx.userId!);

      return { success: true };
    });
  }),

  /**
   * Check if the current user has an unlinked Stripe payment
   *
   * that matches their email (auto-link scenario)
   */
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

  /**
   * Link a Stripe payment to the current user's account
   * by providing the name and email used during Stripe checkout
   */
  linkAccount: protectedProcedure
    .input(
      z.object({
        // Trimmed before the length check: " " passes a bare min(1) and then
        // normalizes to empty, which the ownership check below must never see.
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

        /**
         * Prove the caller is the payer. The email alone is not proof — it is
         * the one thing about someone else's payment that is easy to know — so
         * without this any signed-in user could take over a stranger's
         * membership by typing their address.
         *
         * Either the account email matches the one that paid, or the name they
         * typed matches the name on the payment. The second covers paying with
         * a personal address and signing up with a school one; the first covers
         * payments Stripe recorded without a name.
         */
        const account = await tx.query.users.findFirst({
          where: eq(users.id, ctx.userId!),
          columns: { email: true },
        });

        const normalize = (value: string) =>
          value.toLowerCase().replace(/\s+/g, " ").trim();

        const emailMatches =
          !!account?.email &&
          normalize(account.email) === normalize(payment.customerEmail);

        /**
         * Whole-token equality, not `includes`.
         *
         * A substring test is not a name check: the empty string is a substring
         * of every name, so blank input would match anything, and a single
         * letter would match most names — both turn this guard back into
         * "knowing the email is enough".
         */
        const paymentTokens = new Set(
          normalize(payment.customerName ?? "")
            .split(" ")
            .filter(Boolean),
        );
        const firstName = normalize(input.firstName);
        const lastName = normalize(input.lastName);

        const nameMatches =
          firstName.length > 0 &&
          lastName.length > 0 &&
          paymentTokens.has(firstName) &&
          paymentTokens.has(lastName);

        if (!emailMatches && !nameMatches) {
          logSecurityEvent({
            type: "validation_error",
            identifier: ctx.userId ?? "unknown",
            details: `Failed ownership check linking payment ${payment.id}`,
          });
          // Same message as "no payment", so this cannot be used to discover
          // which addresses have an unclaimed payment sitting against them.
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

        await createOrUpdateMembership(
          tx as unknown as DrizzleDB,
          ctx.userId!,
          input.firstName,
          input.lastName,
        );

        clearMembershipCaches(ctx.cache, ctx.userId!);

        return {
          success: true,
          message: "Account linked successfully! You are now a member.",
        };
      });
    }),

  /**
   * Get the current user's linked payment status
   */
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

async function createOrUpdateMembership(
  db: DrizzleDB,
  userId: string,
  firstName: string,
  lastName: string,
) {
  const hackathonId = await resolveHackathonId(db);

  if (!hackathonId) {
    throw new Error("No hackathon found for membership assignment");
  }

  const existingMember = await db.query.members.findFirst({
    where: and(
      eq(members.userId, userId),
      eq(members.hackathonId, hackathonId),
    ),
  });

  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  if (existingMember) {
    await db
      .update(members)
      .set({
        isActive: true,
        membershipStartDate: now,
        membershipEndDate: oneYearFromNow,
        renewalCount: existingMember.renewalCount + 1,
        memberType: "continuous",
        updatedAt: now,
      })
      .where(eq(members.id, existingMember.id));
  } else {
    await db.insert(members).values({
      userId,
      hackathonId,
      firstName,
      lastName,
      memberType: "new",
      isActive: true,
      membershipStartDate: now,
      membershipEndDate: oneYearFromNow,
      renewalCount: 0,
    });
  }
}
