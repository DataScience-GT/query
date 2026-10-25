// Linking an existing Stripe payment to a portal account.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc";
import { stripePayments, userAccountLinks, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq, and, isNull } from "drizzle-orm";
import { logSecurityEvent } from "../../middleware/security";
import {
  createOrUpdateMembership,
  paidForBootcamp,
  isBootcampAddOnOnly,
  planFromMetadata,
} from "@query/db/services/membership";
import { membershipGrants } from "../../services/metrics";
import { clearMembershipCaches } from "./client";

export const linkingProcedures = {
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
};
