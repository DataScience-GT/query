import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { db, stripePayments, users } from "@query/db";
import {
  createOrUpdateMembership,
  splitName,
  BOOTCAMP_ADDON_PAYMENT_TYPE,
} from "@query/db/services/membership";
import type { DrizzleDB } from "@query/db";
import { eq } from "drizzle-orm";
import {
  clearMembershipCaches,
  MAX_MEMBERSHIP_CHARGE_CENTS,
} from "@query/api";


/**
 * An identifier that is safe to put in a log line.
 *
 * Stripe ids are `[A-Za-z0-9_]`, but the mock branch below parses the request
 * body without verifying a signature, so in development these values are
 * whatever the caller sent. Anything else would let a newline forge log entries
 * (log injection) — and interpolating it into the message argument would let a
 * `%s` be read as a format directive. Both were flagged by CodeQL.
 */
const safeLogId = (value: unknown) =>
  String(value ?? "")
    .replace(/[^\w-]/g, "")
    .replace(/[\n\r]/g, "")
    .slice(0, 64);

const safeLogError = (err: unknown) =>
  err instanceof Error
    ? err.name.replace(/[\n\r]/g, "")
    : "Error";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!stripe || !webhookSecret) {
    console.error(
      "Stripe not initialized. Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET.",
    );
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  if (!db) {
    console.error("Database not initialized.");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  /**
   * Accepting an unsigned body is a local-development affordance and nothing
   * else. Keying it on the mock markers alone meant a mock key deployed to
   * production — which is exactly what .env.production carries — turned this
   * endpoint into "anyone who can POST here grants themselves a paid
   * membership", since the body names both the user and the amount.
   *
   * NODE_ENV is set to production by `next build`/`next start`, so a
   * misconfigured deploy now fails closed on a missing signature instead of
   * trusting the caller.
   */
  const allowUnsignedMockEvents =
    process.env.NODE_ENV !== "production" &&
    process.env.STRIPE_MOCK_MODE === "true";

  if (allowUnsignedMockEvents) {
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch (err) {
      console.error("Failed to parse mock webhook JSON body:", err);
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  /**
   * `async_payment_succeeded` matters because dynamic payment methods are
   * enabled: a bank debit completes the Checkout Session while still `unpaid`
   * and only settles minutes or days later. Handling the completion event
   * alone would record that unpaid row and never come back for it, leaving a
   * customer charged with no membership.
   *
   * Both events carry a Checkout Session, so they share one handler; the
   * membership is granted only on `payment_status: "paid"`, which is false on
   * the first event and true on the second.
   */
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      // Check for amounts greater than $100 (10000 cents)
      if (session.amount_total && session.amount_total > MAX_MEMBERSHIP_CHARGE_CENTS) {
        return NextResponse.json({ received: true });
      }

      // Extract customer info
      const rawEmail =
        session.customer_details?.email || session.customer_email;
      const customerEmail = rawEmail?.toLowerCase(); // Normalize email
      const customerName = session.customer_details?.name;
      const phoneNumber = session.customer_details?.phone;
      const metadataUserId = session.metadata?.userId;

      if (!customerEmail) {
        console.error("No customer email in checkout session");
        return NextResponse.json(
          { error: "No customer email" },
          { status: 400 },
        );
      }

      // Check if payment already exists (idempotency)
      const existingPayment = await db.query.stripePayments.findFirst({
        where: eq(stripePayments.stripeSessionId, session.id),
      });

      if (existingPayment) {
        /**
         * An async payment method recorded this row as unpaid on
         * checkout.session.completed and has now settled. Upgrade it and grant
         * the membership it paid for — returning early here is what would
         * leave that customer charged with nothing.
         */
        if (
          existingPayment.paymentStatus !== "paid" &&
          session.payment_status === "paid"
        ) {
          // Status upgrade commits first; the grant is best-effort after it.
          // Sharing a transaction meant a failed grant reverted the row to
          // "unpaid", losing the settlement Stripe just told us about.
          await db
            .update(stripePayments)
            .set({ paymentStatus: "paid", updatedAt: new Date() })
            .where(eq(stripePayments.id, existingPayment.id));

          if (existingPayment.linkedUserId) {
            try {
              await createOrUpdateMembership(db as unknown as DrizzleDB, {
                userId: existingPayment.linkedUserId,
                ...splitName(customerName),
                phoneNumber,
                bootcampMember: session.metadata?.bootcamp === "true",
                addOnOnly:
                  session.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE,
              });
            } catch (e) {
              // This id is ours (a database row), not request-derived, but it
              // goes through the same path so the log format stays uniform.
              console.error(
                "[Stripe webhook] payment marked paid, membership grant failed",
                safeLogId(existingPayment.id),
                safeLogError(e),
              );
            }
          }
        }

        if (existingPayment.linkedUserId) {
          try {
            // Invalidate cache just in case
            clearMembershipCaches(existingPayment.linkedUserId);
          } catch (e) {
            console.warn("Failed to invalidate cache", e);
          }
        }
        return NextResponse.json({ received: true });
      }

      // Check if user already exists
      // Priority 1: Check metadata userId
      let targetUser: { id: string } | null | undefined = null;

      if (metadataUserId) {
        targetUser = await db.query.users.findFirst({
          where: eq(users.id, metadataUserId),
        });
      }

      // Priority 2: Fallback to email match
      if (!targetUser) {
        targetUser = await db.query.users.findFirst({
          where: eq(users.email, customerEmail),
        });
      }

      // The payment record commits on its own, BEFORE any membership work.
      //
      // These used to share one transaction. createOrUpdateMembership throws
      // when no hackathon edition is open, and that throw rolled back the
      // payment row too — so the customer was charged and nothing anywhere
      // recorded it. Stripe then retried into the same failure until it gave
      // up, and none of the recovery paths (attemptAutoLink,
      // linkPaidPaymentByVerifiedEmail, reconcileMyPayments) could help,
      // because they all look for a payment row that was never written.
      await db.insert(stripePayments).values({
        stripeSessionId: session.id,
        stripeCustomerId: session.customer as string | null,
        stripePaymentIntentId: session.payment_intent as string | null,
        customerEmail, // Normalized
        customerName,
        amountTotal: session.amount_total,
        currency: session.currency || "usd",
        paymentStatus: session.payment_status as
          | "paid"
          | "unpaid"
          | "no_payment_required",
        linkedUserId: targetUser?.id || null,
        linkedAt: targetUser ? new Date() : null,
        metadata: session.metadata ? JSON.stringify(session.metadata) : null,
      });

      // Membership is a separate, best-effort step. A failure here leaves a
      // recorded payment that the link paths can still turn into a membership;
      // failing the whole webhook would lose the payment instead.
      if (targetUser && session.payment_status === "paid") {
        try {
          await createOrUpdateMembership(db as unknown as DrizzleDB, {
            userId: targetUser.id,
            ...splitName(customerName),
            phoneNumber,
            bootcampMember: session.metadata?.bootcamp === "true",
            addOnOnly: session.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE,
          });
          clearMembershipCaches(targetUser.id);
        } catch (e) {
          // The id is passed as an argument, never interpolated into the
          // message, and stripped to the characters a Stripe id can contain.
          // In the mock branch the body is parsed without verifying a
          // signature, so this value is not always Stripe's — a newline in it
          // would forge log entries, and a `%s` would be read as a format
          // directive. Flagged by CodeQL as both.
          console.error(
            "[Stripe webhook] membership grant failed for checkout session",
            safeLogId(session.id),
            safeLogError(e),
          );
        }
      }
    } catch (error) {
      console.error("Error processing checkout session:", error);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  }

  /**
   * The Payment Element flow (stripe.createPaymentIntent) never produces a
   * checkout session, so without this branch the only thing that records the
   * charge is the client calling confirmMembershipAfterPayment. A closed tab or
   * a dropped connection between the card confirming and that call therefore
   * left a captured payment with no row at all — and reopening the modal minted
   * a fresh intent, charging the member a second time.
   */
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;

    try {
      if (pi.amount > MAX_MEMBERSHIP_CHARGE_CENTS) {
        return NextResponse.json({ received: true });
      }

      /**
       * Only intents this app minted for a membership.
       *
       * A Checkout Session creates its own PaymentIntent and does not copy the
       * session metadata onto it, so without this gate a hosted-checkout
       * payment would be recorded once by checkout.session.completed and again
       * here — activating the membership twice and bumping renewalCount for a
       * single $15. Any unrelated charge on the account would land here too.
       */
      // The add-on is the second kind of intent this app creates; it has to
      // pass too, or a browser closed before the client callback loses $10.
      if (
        pi.metadata?.type !== "membership" &&
        pi.metadata?.type !== BOOTCAMP_ADDON_PAYMENT_TYPE
      ) {
        return NextResponse.json({ received: true });
      }

      const metadataUserId = pi.metadata?.userId;

      let targetUser:
        | { id: string; name: string | null; email: string | null }
        | null
        | undefined = null;

      if (metadataUserId) {
        targetUser = await db.query.users.findFirst({
          where: eq(users.id, metadataUserId),
        });
      }

      const receiptEmail = pi.receipt_email?.toLowerCase();
      if (!targetUser && receiptEmail) {
        targetUser = await db.query.users.findFirst({
          where: eq(users.email, receiptEmail),
        });
      }

      const customerEmail = receiptEmail ?? targetUser?.email?.toLowerCase();
      if (!customerEmail) {
        // No request-derived value in the log line: the mock branch parses the
        // body without verifying a signature, so this id is not always Stripe's.
        console.error("No customer email on payment intent");
        return NextResponse.json({ received: true });
      }

      // Same synthetic session id confirmMembershipAfterPayment writes, so
      // the existing unique on stripeSessionId settles the race between this
      // webhook and the client callback: whichever lands second inserts
      // nothing and leaves the first one's membership alone.
      //
      // Not in a transaction with the grant below: onConflictDoNothing already
      // makes the insert idempotent, and wrapping the two together meant a
      // membership failure rolled back the payment record as well.
      const inserted = await db
        .insert(stripePayments)
          .values({
            stripeSessionId: `pi_${pi.id}`,
            stripeCustomerId:
              typeof pi.customer === "string"
                ? pi.customer
                : (pi.customer?.id ?? null),
            stripePaymentIntentId: pi.id,
            customerEmail,
            customerName: targetUser?.name ?? null,
            amountTotal: pi.amount,
            currency: pi.currency || "usd",
            paymentStatus: "paid",
            linkedUserId: targetUser?.id ?? null,
            linkedAt: targetUser ? new Date() : null,
            metadata: pi.metadata ? JSON.stringify(pi.metadata) : null,
          })
          .onConflictDoNothing({ target: stripePayments.stripeSessionId })
          .returning({ id: stripePayments.id });

      // Another writer got there first and has already granted the membership.
      if (inserted.length > 0 && targetUser) {
        try {
          await createOrUpdateMembership(db as unknown as DrizzleDB, {
            userId: targetUser.id,
            ...splitName(targetUser.name),
            bootcampMember: pi.metadata?.bootcamp === "true",
            // Where an unconfirmed add-on lands. $10 must not buy a year.
            addOnOnly: pi.metadata?.type === BOOTCAMP_ADDON_PAYMENT_TYPE,
          });
          clearMembershipCaches(targetUser.id);
        } catch (e) {
          // Same reasoning as the checkout-session branch above.
          console.error(
            "[Stripe webhook] membership grant failed for payment intent",
            safeLogId(pi.id),
            safeLogError(e),
          );
        }
      }
    } catch (error) {
      console.error("Error processing payment intent:", error);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
