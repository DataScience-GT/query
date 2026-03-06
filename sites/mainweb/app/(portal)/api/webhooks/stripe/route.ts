import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db, stripePayments, users, members } from "@query/db";
import { eq } from "drizzle-orm";
import { cache } from "@query/api";

// Type for the transaction object
type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0];

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-12-15.clover",
  })
  : null;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!stripe || !webhookSecret) {
    console.error("Stripe not initialized. Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET.");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (!db) {
    console.error("Database not initialized.");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      // Check for amounts greater than $100 (10000 cents)
      if (session.amount_total && session.amount_total > 10000) {
        console.log(`Ignoring payment of ${session.amount_total} cents (>${10000})`);
        return NextResponse.json({ received: true });
      }

      // Extract customer info
      const rawEmail = session.customer_details?.email || session.customer_email;
      const customerEmail = rawEmail?.toLowerCase(); // Normalize email
      const customerName = session.customer_details?.name;
      const phoneNumber = session.customer_details?.phone;
      const metadataUserId = session.metadata?.userId;

      if (!customerEmail) {
        console.error("No customer email in checkout session");
        return NextResponse.json({ error: "No customer email" }, { status: 400 });
      }

      // Check if payment already exists (idempotency)
      const existingPayment = await db.query.stripePayments.findFirst({
        where: eq(stripePayments.stripeSessionId, session.id),
      });

      if (existingPayment) {
        console.log(`Payment already processed: ${session.id}`);
        // If payment exists, verify membership was created too
        if (existingPayment.linkedUserId) {
          try {
            // Invalidate cache just in case
            cache.delete(`member:${existingPayment.linkedUserId}`);
            cache.delete(`member:status:${existingPayment.linkedUserId}`);
          } catch (e) {
            console.warn("Failed to invalidate cache", e);
          }
        }
        return NextResponse.json({ received: true });
      }

      // Check if user already exists
      // Priority 1: Check metadata userId
      let targetUser = null;

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
        // Save payment record
        const [payment] = await tx
          .insert(stripePayments)
          .values({
            stripeSessionId: session.id,
            stripeCustomerId: session.customer as string | null,
            stripePaymentIntentId: session.payment_intent as string | null,
            customerEmail, // Normalized
            customerName,
            amountTotal: session.amount_total,
            currency: session.currency || "usd",
            paymentStatus: session.payment_status as "paid" | "unpaid" | "no_payment_required",
            linkedUserId: targetUser?.id || null,
            linkedAt: targetUser ? new Date() : null,
            metadata: session.metadata ? JSON.stringify(session.metadata) : null,
          })
          .returning();

        // If user exists and paid, create/update membership
        if (targetUser && session.payment_status === "paid") {
          await createOrUpdateMembership(tx, targetUser.id, customerName, customerEmail, phoneNumber);

          // Invalidate cache
          try {
            cache.delete(`member:${targetUser.id}`);
            cache.delete(`member:status:${targetUser.id}`);
          } catch (e) {
            console.warn("Failed to invalidate cache inside webhook", e);
          }
        }

        console.log(`Stripe payment recorded: ${payment?.id} for ${customerEmail} (Linked to: ${targetUser?.id || 'Unlinked'})`);
      });

    } catch (error) {
      console.error("Error processing checkout session:", error);
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
  phoneNumber: string | null | undefined
) {
  // Check if member already exists
  const existingMember = await tx.query.members.findFirst({
    where: eq(members.userId, userId),
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

    console.log(`Membership renewed for user ${userId}`);
  } else {
    // Create new membership
    await tx.insert(members).values({
      userId,
      firstName,
      lastName,
      memberType: "new",
      isActive: true,
      membershipStartDate: now,
      membershipEndDate: oneYearFromNow,
      renewalCount: 0,
      phoneNumber: phoneNumber || null,
    });

    console.log(`New membership created for user ${userId}`);
  }
}
