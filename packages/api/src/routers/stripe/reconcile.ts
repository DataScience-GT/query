// Recovering membership payments Stripe took but this app never recorded.

import { protectedProcedure } from "../../trpc";
import { members, membershipHistory, stripePayments, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { logSecurityEvent } from "../../middleware/security";
import { isUniqueViolation } from "../../middleware/db-errors";
import {
  createOrUpdateMembership,
  readPlan,
  BOOTCAMP_ADDON_PAYMENT_TYPE,
} from "@query/db/services/membership";
import { MAX_MEMBERSHIP_CHARGE_CENTS } from "../../services/pricing";
import { membershipGrants, paymentsRecovered } from "../../services/metrics";
import type Stripe from "stripe";
import { getStripe, clearMembershipCaches } from "./client";

type PortalUser = typeof users.$inferSelect | undefined;
type StoredPayment = typeof stripePayments.$inferSelect;

/** What one reconcile run knows about the member, shared by every intent. */
type ReconcileScope = {
  db: DrizzleDB;
  userId: string;
  user: PortalUser;
  member: { id: string } | undefined;
  newestGrant: { createdAt: Date } | undefined;
};

/** Grants the membership a succeeded intent paid for. */
async function grantMembership(
  tx: DrizzleDB,
  userId: string,
  user: PortalUser,
  pi: Stripe.PaymentIntent,
) {
  const parts = (user?.name || "Member").trim().split(/\s+/);
  await createOrUpdateMembership(tx, {
    userId,
    firstName: parts[0] || "Member",
    lastName: parts.slice(1).join(" ") || "Member",
    bootcampMember: pi.metadata?.bootcamp === "true",
    addOnOnly: pi.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE,
    plan: readPlan(pi.metadata?.plan),
  });
}

/** The user's succeeded membership intents; none when Stripe search is down. */
async function findMembershipIntents(stripe: Stripe, userId: string) {
  let found;
  try {
    // Scoped by metadata to this user, so it can only recover their own payments.
    // Stripe's search index lags writes by up to a minute, fine for a backstop.
    found = await stripe.paymentIntents.search({
      query: `metadata['userId']:'${userId}' AND status:'succeeded'`,
      limit: 20,
    });
  } catch {
    // Search is unavailable on some accounts and versions; a failed backstop must
    // not break the page that called it.
    return [];
  }

  // Same ceiling the webhook applies, so the two paths cannot disagree about
  // which charges are memberships.
  return found.data.filter(
    (pi) =>
      pi.metadata?.type === "membership" &&
      pi.metadata?.userId === userId &&
      pi.amount <= MAX_MEMBERSHIP_CHARGE_CENTS,
  );
}

/** The rows already stored for these intents, and the member's newest grant. */
async function loadReconcileState(
  db: DrizzleDB,
  userId: string,
  intents: Stripe.PaymentIntent[],
) {
  // Once ahead of the loop, not per intent: twenty intents meant sixty round
  // trips to answer three questions.
  const [existingRows, member] = await Promise.all([
    db.query.stripePayments.findMany({
      where: inArray(
        stripePayments.stripePaymentIntentId,
        intents.map((pi) => pi.id),
      ),
    }),
    db.query.members.findFirst({
      where: eq(members.userId, userId),
      columns: { id: true },
    }),
  ]);

  const existingByIntent = new Map(
    existingRows.map((row) => [row.stripePaymentIntentId, row]),
  );

  // "A grant at or after this payment" is "is the newest grant at or after it".
  const newestGrant = member
    ? await db.query.membershipHistory.findFirst({
        where: eq(membershipHistory.memberId, member.id),
        orderBy: (history, { desc }) => [desc(history.createdAt)],
        columns: { createdAt: true },
      })
    : undefined;

  return { existingByIntent, member, newestGrant };
}

/** A payment linked to this user whose membership may never have been granted. */
async function regrantUnhonouredPayment(
  scope: ReconcileScope,
  existing: StoredPayment,
  pi: Stripe.PaymentIntent,
): Promise<boolean> {
  const { db, userId, user, member, newestGrant } = scope;

  // Linked to this user is NOT proof the membership was granted. The webhook
  // records the payment first and grants afterwards on purpose — sharing a
  // transaction meant a failed grant rolled the payment back and lost the
  // charge — so linked-with-no-membership is a real state, and skipping every
  // linked payment made it permanent. membership_history tells them apart:
  // every grant writes a row, so a payment with no history row at or after its
  // own timestamp was never honoured. That also keeps a membership granted a
  // year ago and since lapsed from being silently renewed off an old payment.
  const honoured =
    newestGrant !== undefined &&
    newestGrant !== null &&
    newestGrant.createdAt >= existing.createdAt;

  if (honoured) return false;

  // This runs on every portal load, so two tabs race here. Lock the member
  // and re-read the newest grant under the lock: the loser sees the
  // winner's history row and stops instead of adding a second year.
  return db
    .transaction(async (tx) => {
      if (member) {
        await tx
          .select({ id: members.id })
          .from(members)
          .where(eq(members.id, member.id))
          .for("update");
        const latest = await tx.query.membershipHistory.findFirst({
          where: eq(membershipHistory.memberId, member.id),
          orderBy: (history, { desc }) => [desc(history.createdAt)],
          columns: { createdAt: true },
        });
        if (latest && latest.createdAt >= existing.createdAt) return false;
      }

      await grantMembership(tx as unknown as DrizzleDB, userId, user, pi);
      return true;
    })
    .catch((error: unknown) => {
      // With no member row there is nothing to lock, and the other tab's
      // insert wins unique_member_per_user. It granted; this one has not.
      if (isUniqueViolation(error)) return false;
      throw error;
    });
}

/** A recorded payment nobody linked yet: claim it for this user and grant. */
async function claimUnlinkedPayment(
  scope: ReconcileScope,
  existing: StoredPayment,
  pi: Stripe.PaymentIntent,
): Promise<boolean> {
  const { db, userId, user } = scope;
  let claimedNow = false;

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(stripePayments)
      .set({
        linkedUserId: userId,
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

    await grantMembership(tx as unknown as DrizzleDB, userId, user, pi);
    claimedNow = true;
  });

  return claimedNow;
}

/** An intent with no stored row: record the payment and grant the membership. */
async function recordMissingPayment(
  scope: ReconcileScope,
  pi: Stripe.PaymentIntent,
): Promise<boolean> {
  const { db, userId, user } = scope;
  let recordedNow = false;

  try {
    await db.transaction(async (tx) => {
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
          customerEmail: (pi.receipt_email ?? user?.email ?? "").toLowerCase(),
          customerName: user?.name ?? "Member",
          amountTotal: pi.amount,
          currency: pi.currency,
          paymentStatus: "paid",
          linkedUserId: userId,
          linkedAt: new Date(),
          metadata: JSON.stringify(pi.metadata ?? {}),
        })
        .onConflictDoNothing({ target: stripePayments.stripeSessionId })
        .returning({ id: stripePayments.id });

      if (inserted.length === 0) return;

      await grantMembership(tx as unknown as DrizzleDB, userId, user, pi);
      recordedNow = true;
    });
  } catch (error) {
    logSecurityEvent({
      type: "validation_error",
      identifier: userId,
      details: `Payment reconcile failed: ${error}`,
    });
  }

  return recordedNow;
}

export const reconcileProcedures = {
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

    const db = ctx.db!;
    const userId = ctx.userId!;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    const candidates = await findMembershipIntents(stripe, userId);
    if (candidates.length === 0) return { recovered: 0 };

    const { existingByIntent, member, newestGrant } = await loadReconcileState(
      db,
      userId,
      candidates,
    );
    const scope: ReconcileScope = { db, userId, user, member, newestGrant };

    let recovered = 0;
    for (const pi of candidates) {
      const existing = existingByIntent.get(pi.id);

      // A row that exists but was never linked is the half-finished state this is
      // here to repair — treating "row exists" as "done" would strand it.
      let granted: boolean;
      if (!existing) {
        granted = await recordMissingPayment(scope, pi);
      } else if (existing.linkedUserId && existing.linkedUserId !== userId) {
        // Somebody else's payment. Not ours to touch.
        continue;
      } else if (existing.linkedUserId) {
        granted = await regrantUnhonouredPayment(scope, existing, pi);
      } else {
        granted = await claimUnlinkedPayment(scope, existing, pi);
      }
      if (granted) recovered += 1;
    }

    if (recovered > 0) {
      // Every one of these is a charge that reached Stripe and never reached this
      // app — the backstop working means something upstream did not.
      paymentsRecovered.inc(recovered);
      membershipGrants.inc({ source: "reconcile", plan: "unknown" }, recovered);
      clearMembershipCaches(ctx.cache, userId);
    }

    return { recovered };
  }),
};
