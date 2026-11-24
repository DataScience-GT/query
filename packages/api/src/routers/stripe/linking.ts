// Linking an existing Stripe payment to a portal account.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc";
import { isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { escapeLike } from "../judging/admin/shared";
import { stripePayments, userAccountLinks, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { logSecurityEvent } from "../../middleware/security";
import { createOrUpdateMembership, splitName } from "@query/db/services/membership";
import { entitlementForPayment } from "@query/db/services/pricing";
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
        where: { id: ctx.userId! },
      });

      if (!user?.email) return { success: false };

      // Only a payment whose amount buys something is claimable, so a stray
      // $1 link neither grants a year nor uses up the account's one link.
      const candidates = await tx.query.stripePayments.findMany({
        where: {
          customerEmail: user.email,
          linkedUserId: { isNull: true },
          paymentStatus: "paid",
        },
      });
      const payment = candidates.find((row) => entitlementForPayment(row));
      const entitlement = payment && entitlementForPayment(payment);

      if (!payment || !entitlement) return { success: false };

      // Verify not already linked (double check)
      const existingLink = await tx.query.userAccountLinks.findFirst({
        where: { userId: ctx.userId! },
      });
      if (existingLink) return { success: true };

      const names = (user.name || "Member").split(" ");
      const firstName = names[0] || "Member";
      const lastName = names.slice(1).join(" ") || "Member";
      const { bootcamp: bootcampMember, addOnOnly, plan } = entitlement;

      // The claim carries the read into the write, so a concurrent claim of the
      // same payment cannot grant twice.
      const claimed = await tx
        .update(stripePayments)
        .set({
          linkedUserId: ctx.userId!,
          linkedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(stripePayments.id, payment.id),
            isNull(stripePayments.linkedUserId),
          ),
        )
        .returning({ id: stripePayments.id });
      if (claimed.length === 0) return { success: false };

      await tx.insert(userAccountLinks).values({
        userId: ctx.userId!,
        stripePaymentId: payment.id,
        providedFirstName: firstName,
        providedLastName: lastName,
        providedEmail: user.email,
      });

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
      where: { id: ctx.userId! },
    });

    if (!user?.email) {
      return { hasPendingPayment: false };
    }

    const pendingPayment = await ctx.db!.query.stripePayments.findFirst({
      where: {
        customerEmail: user.email,
        linkedUserId: { isNull: true },
        paymentStatus: "paid",
      },
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
        const candidates = await tx.query.stripePayments.findMany({
          where: {
            customerEmail: input.email.toLowerCase(),
            linkedUserId: { isNull: true },
            paymentStatus: "paid",
          },
        });
        // A payment whose amount buys nothing is not claimable (see attemptAutoLink).
        const payment = candidates.find((row) => entitlementForPayment(row));
        const entitlement = payment && entitlementForPayment(payment);

        if (!payment || !entitlement) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "No payment found with that email. Please check the email you used during checkout.",
          });
        }

        // Prove the caller is the payer: the signed-in account's email must be the
        // one on the payment. The typed email and name prove nothing, since both
        // are easy to learn about someone else, so a name match is not accepted
        // as a substitute. A payment made under a different address is linked
        // by an officer from the admin side.
        const account = await tx.query.users.findFirst({
          where: { id: ctx.userId! },
          columns: { email: true },
        });

        const normalize = (value: string) =>
          value.toLowerCase().replace(/\s+/g, " ").trim();

        const emailMatches =
          !!account?.email &&
          normalize(account.email) === normalize(payment.customerEmail);

        if (!emailMatches) {
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
          where: { stripePaymentId: payment.id },
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
          where: { userId: ctx.userId! },
        });

        if (userExistingLink) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Your account is already linked to a payment.",
          });
        }

        // Lock the payment and claim it only while still unlinked, so two
        // simultaneous links of the same payment cannot both be granted.
        await tx
          .select({ id: stripePayments.id })
          .from(stripePayments)
          .where(eq(stripePayments.id, payment.id))
          .for("update");

        const claimed = await tx
          .update(stripePayments)
          .set({
            linkedUserId: ctx.userId!,
            linkedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(stripePayments.id, payment.id),
              isNull(stripePayments.linkedUserId),
            ),
          )
          .returning({ id: stripePayments.id });

        if (claimed.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment has already been linked to an account.",
          });
        }

        await tx.insert(userAccountLinks).values({
          userId: ctx.userId!,
          stripePaymentId: payment.id,
          providedFirstName: input.firstName,
          providedLastName: input.lastName,
          providedEmail: input.email.toLowerCase(),
        });

        await createOrUpdateMembership(tx as unknown as DrizzleDB, {
          userId: ctx.userId!,
          firstName: input.firstName,
          lastName: input.lastName,
          bootcampMember: entitlement.bootcamp,
          addOnOnly: entitlement.addOnOnly,
          plan: entitlement.plan,
        });

        membershipGrants.inc({ source: "link", plan: entitlement.plan });
        clearMembershipCaches(ctx.cache, ctx.userId!);

        return {
          success: true,
          message: "Account linked successfully! You are now a member.",
        };
      });
    }),

  // Paid payments nobody has claimed, for an officer to attach to an account
  // when the payer used a different email than their portal login.
  listUnlinkedPayments: isAdmin
    .input(
      z.object({
        query: z.string().trim().max(200).default(""),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const pattern = `%${escapeLike(input.query)}%`;
      const where = and(
        eq(stripePayments.paymentStatus, "paid"),
        isNull(stripePayments.linkedUserId),
        input.query
          ? or(
              ilike(stripePayments.customerEmail, pattern),
              ilike(stripePayments.customerName, pattern),
            )
          : undefined,
      );

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: stripePayments.id,
            customerEmail: stripePayments.customerEmail,
            customerName: stripePayments.customerName,
            amountTotal: stripePayments.amountTotal,
            metadata: stripePayments.metadata,
            createdAt: stripePayments.createdAt,
          })
          .from(stripePayments)
          .where(where)
          .orderBy(desc(stripePayments.createdAt), desc(stripePayments.id))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: count() }).from(stripePayments).where(where),
      ]);

      return {
        total: totalRow?.total ?? 0,
        items: rows.map(({ metadata, ...row }) => ({
          ...row,
          entitlement: entitlementForPayment({
            metadata,
            amountTotal: row.amountTotal,
          }),
        })),
      };
    }),

  // An officer attaches a payment to an account whose email differs from the
  // payer's. Same writes as linkAccount, minus the email proof: the officer is
  // the proof, and the action is audited.
  linkPaymentToUser: isAdmin
    .input(
      z
        .object({
          paymentId: z.string().uuid(),
          userId: z.string().min(1).max(255).optional(),
          email: z.string().trim().email().max(255).optional(),
        })
        .refine((v) => !!v.userId !== !!v.email, {
          message: "Give either a user id or an email.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const outcome = await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(
            input.userId
              ? eq(users.id, input.userId)
              : sql`lower(${users.email}) = ${input.email!.toLowerCase()}`,
          )
          .limit(1);
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "No account has that email. They need to sign in to the portal once first.",
          });
        }

        const [payment] = await tx
          .select()
          .from(stripePayments)
          .where(eq(stripePayments.id, input.paymentId))
          .for("update");
        if (!payment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payment not found.",
          });
        }
        if (payment.paymentStatus !== "paid") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This payment was not paid, so it cannot grant a membership.",
          });
        }
        if (payment.linkedUserId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment has already been linked to an account.",
          });
        }

        const entitlement = entitlementForPayment(payment);
        if (!entitlement) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This payment amount does not match any membership, so it cannot be linked. Use Memberships to grant time by hand.",
          });
        }

        const userExistingLink = await tx.query.userAccountLinks.findFirst({
          where: { userId: user.id },
        });
        if (userExistingLink) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That account is already linked to a payment.",
          });
        }

        const claimed = await tx
          .update(stripePayments)
          .set({
            linkedUserId: user.id,
            linkedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(stripePayments.id, payment.id),
              isNull(stripePayments.linkedUserId),
            ),
          )
          .returning({ id: stripePayments.id });
        if (claimed.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment has already been linked to an account.",
          });
        }

        const payer = splitName(payment.customerName);
        await tx.insert(userAccountLinks).values({
          userId: user.id,
          stripePaymentId: payment.id,
          providedFirstName: payer.firstName,
          providedLastName: payer.lastName,
          providedEmail: payment.customerEmail.toLowerCase(),
        });

        const member = splitName(user.name);
        await createOrUpdateMembership(tx as unknown as DrizzleDB, {
          userId: user.id,
          firstName: member.firstName,
          lastName: member.lastName,
          bootcampMember: entitlement.bootcamp,
          addOnOnly: entitlement.addOnOnly,
          plan: entitlement.plan,
        });

        return { user, payment, entitlement };
      });

      membershipGrants.inc({
        source: "admin_link",
        plan: outcome.entitlement.plan,
      });
      clearMembershipCaches(ctx.cache, outcome.user.id);

      // After the transaction, as in member.adminGrant.
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "stripe.linkPaymentToUser",
        resourceId: outcome.payment.id,
        severity: "critical",
        metadata: {
          linkedUserId: outcome.user.id,
          payerEmail: outcome.payment.customerEmail,
          amountTotal: outcome.payment.amountTotal,
          plan: outcome.entitlement.plan,
          bootcamp: outcome.entitlement.bootcamp,
          addOnOnly: outcome.entitlement.addOnOnly,
        },
      });

      return {
        success: true,
        userEmail: outcome.user.email,
        entitlement: outcome.entitlement,
      };
    }),

  // The current user's linked payment status.
  getLinkedPayment: protectedProcedure.query(async ({ ctx }) => {
    const link = await ctx.db!.query.userAccountLinks.findFirst({
      where: { userId: ctx.userId! },
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
