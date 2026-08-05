import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { db, stripePayments, users, members } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq, and } from "drizzle-orm";
import { clearMembershipCaches, resolveHackathonId } from "@query/api";

// Type for the transaction object
type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0];


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
    (process.env.STRIPE_SECRET_KEY?.startsWith("mk_") ||
      process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_mock"));

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      // Check for amounts greater than $100 (10000 cents)
      if (session.amount_total && session.amount_total > 10000) {
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
        // If payment exists, verify membership was created too
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

      // Execute in transaction
      await db.transaction(async (tx) => {
        await tx.insert(stripePayments).values({
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

        // If user exists and paid, create/update membership
        if (targetUser && session.payment_status === "paid") {
          await createOrUpdateMembership(
            tx,
            targetUser.id,
            customerName,
            customerEmail,
            phoneNumber,
          );

          // Invalidate cache
          try {
            clearMembershipCaches(targetUser.id);
          } catch (e) {
            console.warn("Failed to invalidate cache inside webhook", e);
          }
        }
      });
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
      if (pi.amount > 10000) {
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
      if (pi.metadata?.type !== "membership") {
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

      await db.transaction(async (tx) => {
        // Same synthetic session id confirmMembershipAfterPayment writes, so
        // the existing unique on stripeSessionId settles the race between this
        // webhook and the client callback: whichever lands second inserts
        // nothing and leaves the first one's membership alone.
        const inserted = await tx
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

        if (inserted.length === 0) return;

        if (targetUser) {
          await createOrUpdateMembership(
            tx,
            targetUser.id,
            targetUser.name,
            customerEmail,
            null,
          );

          try {
            clearMembershipCaches(targetUser.id);
          } catch (e) {
            console.warn("Failed to invalidate cache inside webhook", e);
          }
        }
      });
    } catch (error) {
      console.error("Error processing payment intent:", error);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

async function createOrUpdateMembership(
  tx: Tx,
  userId: string,
  customerName: string | null | undefined,
  customerEmail: string,
  phoneNumber: string | null | undefined,
) {
  // Same rule as every membership read, so a payment does not land against
  // next year's draft while this year's edition is running.
  const hackathonId = await resolveHackathonId(tx as unknown as DrizzleDB);

  if (!hackathonId) {
    throw new Error("No hackathon found for membership assignment");
  }

  // Check if member already exists for this hackathon
  const existingMember = await tx.query.members.findFirst({
    where: and(
      eq(members.userId, userId),
      eq(members.hackathonId, hackathonId),
    ),
  });

  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  // Parse name
  const nameParts = (customerName || "Member").split(" ");
  const firstName = nameParts[0] || "Member";
  const lastName = nameParts.slice(1).join(" ") || "";

  if (existingMember) {
    // Renew membership
    await tx
      .update(members)
      .set({
        isActive: true,
        membershipStartDate: now,
        membershipEndDate: oneYearFromNow,
        renewalCount: existingMember.renewalCount + 1,
        memberType: "continuous",
        updatedAt: now,
        phoneNumber: phoneNumber || existingMember.phoneNumber, // Update phone if provided
      })
      .where(eq(members.id, existingMember.id));
  } else {
    // Create new membership
    await tx.insert(members).values({
      userId,
      hackathonId,
      firstName,
      lastName,
      memberType: "new",
      isActive: true,
      membershipStartDate: now,
      membershipEndDate: oneYearFromNow,
      renewalCount: 0,
      phoneNumber: phoneNumber || null,
    });
  }
}
