// Stripe client, mock mode and key checks shared by the payment procedures.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logSecurityEvent } from "../../middleware/security";
import {
  clearMembershipCaches as clearMembershipCachesFor,
} from "../../middleware/cache";
import type Stripe from "stripe";

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
export const planInput = z.enum(["annual", "semester"]).default("annual");

export const planLabel = (plan: "annual" | "semester") =>
  plan === "semester" ? "one semester" : "one year";

// Mock mode records a paid payment and activates a membership with no money
// moving. Switched on by an explicit flag, never a key prefix: the old `mk_`
// prefix looked enough like a credential to get committed and shipped, which
// silently put the live site into mock mode. `next build`/`next start` set
// NODE_ENV=production, where the flag is ignored, so production fails closed.
export const isMockMode = () =>
  process.env.STRIPE_MOCK_MODE === "true" &&
  process.env.NODE_ENV !== "production";

// Secret and publishable keys must be the same Stripe mode. An intent minted
// with a test secret cannot be confirmed by a live publishable key, and
// Stripe.js reports that as a vague client-side error with no hint that the
// two disagree — easy to hit when only one is swapped.
export const assertKeyModesMatch = (secretKey: string) => {
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!publishable) return;

  // Restricted keys (rk_live_/rk_test_) are the recommended kind, so matching
  // only `sk_` would read a live restricted key as test mode and refuse
  // payments.
  const secretIsLive = /^[sr]k_live/.test(secretKey);
  const publishableIsLive = publishable.startsWith("pk_live");

  if (secretIsLive !== publishableIsLive) {
    // Members see the outage; the cause goes to the log, like describeKeyProblem.
    logSecurityEvent({
      type: "validation_error",
      identifier: "stripe-config",
      details:
        "Stripe unavailable: secret and publishable keys are for different modes (live vs test)",
    });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Payment service is currently unavailable. Please try again later.",
    });
  }
};

// Why payments are unavailable, for the server log. The member-facing string
// is useless to whoever has to fix it — a missing key and a mock key in
// production look identical. Names the cause without logging key material.
export const describeKeyProblem = (key: string | undefined) => {
  if (!key) return "STRIPE_SECRET_KEY is not set on this deployment";
  return null;
};

export const getStripe = (): Promise<Stripe | null> => stripeClients.get();

// Shared by reconcile and linking so both evict the identical key set.
export function clearMembershipCaches(_cache: unknown, userId: string) {
  clearMembershipCachesFor(userId);
}
