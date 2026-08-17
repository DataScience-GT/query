/**
 * Type-only, so nothing from @query/db reaches the client bundle this module is
 * also imported into. The union lives with the grant logic in @query/db because
 * that is what has to honour it; here it only prices.
 */
import type { MembershipPlan } from "@query/db/services/membership";

/**
 * Membership pricing, in one place.
 *
 * These numbers previously lived inline in createPaymentIntent, in the Checkout
 * line item, and in three pieces of UI copy. They drifted: hosted checkout
 * charged $25 for the membership the modal and the portal both priced at $15.
 * Everything that quotes or charges a price now reads from here.
 *
 * Cents, because that is what Stripe takes.
 */
export const MEMBERSHIP_CENTS = 2500;

/** The same membership, bought for one semester instead of a year. */
export const SEMESTER_MEMBERSHIP_CENTS = 1500;

/**
 * Charged on top of the membership, not instead of it — and on top of either
 * plan, since the bootcamp runs for a semester either way.
 */
export const BOOTCAMP_ADDON_CENTS = 1000;

export const membershipCentsFor = (plan: MembershipPlan) =>
  plan === "semester" ? SEMESTER_MEMBERSHIP_CENTS : MEMBERSHIP_CENTS;

export const priceForCents = (
  withBootcamp: boolean,
  plan: MembershipPlan = "annual",
) => membershipCentsFor(plan) + (withBootcamp ? BOOTCAMP_ADDON_CENTS : 0);

/** "$25.00" — for UI copy and Stripe product descriptions. */
export const formatCents = (cents: number) =>
  `$${(cents / 100).toFixed(2)}`;

/**
 * Upper bound for a charge this app is willing to treat as a membership.
 *
 * The webhook and the reconcile path both use it to ignore unrelated activity
 * on the Stripe account, so it has to sit above the most expensive thing we
 * actually sell and nowhere near a real invoice.
 */
export const MAX_MEMBERSHIP_CHARGE_CENTS = 10000;
