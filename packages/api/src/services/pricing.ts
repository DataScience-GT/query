// Type-only, so nothing from @query/db reaches the client bundle this module
// is also imported into. The union lives with the grant logic in @query/db
// because that is what has to honour it; here it only prices.
import type { MembershipPlan } from "@query/db/services/membership";

// Membership pricing, in one place. These numbers used to live inline in
// createPaymentIntent, in the Checkout line item and in three pieces of UI
// copy, and they drifted: hosted checkout charged $25 for the membership the
// modal priced at $15. Cents, because that is what Stripe takes.
export const MEMBERSHIP_CENTS = 2500;

/** The same membership, bought for one semester instead of a year. */
export const SEMESTER_MEMBERSHIP_CENTS = 1500;

// Charged on top of the membership, not instead of it — and on top of either
// plan, since the bootcamp runs for a semester either way.
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

/** What a payment bought, once it is known. */
export type PurchasedEntitlement = {
  plan: MembershipPlan;
  bootcamp: boolean;
  addOnOnly: boolean;
};

// What a given amount buys, or null if it buys nothing. Only consulted for a
// payment that did not come from the portal — a Stripe payment link or a
// Dashboard charge, which carries no metadata. Those used to be granted a
// full year, because an absent `plan` reads as "annual", so a $1 link bought
// a membership. Exact rather than "at least": a member who pays the wrong
// amount should be looked at by a person. Known ambiguity — a semester plus
// the add-on costs the same as a year (1500 + 1000 = 2500), so an outside
// payment of that amount is read as the year, which cannot short-change
// someone who did buy it.
export const entitlementForCents = (
  cents: number | null | undefined,
): PurchasedEntitlement | null => {
  switch (cents) {
    case MEMBERSHIP_CENTS:
      return { plan: "annual", bootcamp: false, addOnOnly: false };
    case SEMESTER_MEMBERSHIP_CENTS:
      return { plan: "semester", bootcamp: false, addOnOnly: false };
    case MEMBERSHIP_CENTS + BOOTCAMP_ADDON_CENTS:
      return { plan: "annual", bootcamp: true, addOnOnly: false };
    case BOOTCAMP_ADDON_CENTS:
      // Buys the semester's bootcamp and nothing else. addOnOnly is what stops $10
      // from minting a membership year.
      return { plan: "annual", bootcamp: true, addOnOnly: true };
    default:
      return null;
  }
};

// Upper bound for a charge this app will treat as a membership. The webhook
// and the reconcile path both use it to ignore unrelated Stripe activity, so
// it sits above the most expensive thing we sell and nowhere near an invoice.
export const MAX_MEMBERSHIP_CHARGE_CENTS = 10000;
