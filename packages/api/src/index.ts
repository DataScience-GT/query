import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter as AppRouterType } from "./root";

export { appRouter, type AppRouter } from "./root";

/** So a component types itself off the procedure instead of restating it. */
export type RouterInputs = inferRouterInputs<AppRouterType>;
export type RouterOutputs = inferRouterOutputs<AppRouterType>;
export { createContext, type Context } from "./context";
export { createTRPCRouter, publicProcedure, protectedProcedure } from "./trpc";
export { rateLimit, RATE_LIMITS, resolveClientIp } from "./middleware/security";
export {
  cache,
  CacheKeys,
  invalidatePortalContext,
  clearMembershipCaches,
} from "./middleware/cache";
export { resolveHackathonId } from "./services/portal-context";
export {
  MEMBERSHIP_CENTS,
  BOOTCAMP_ADDON_CENTS,
  MAX_MEMBERSHIP_CHARGE_CENTS,
  priceForCents,
  formatCents,
  entitlementForCents,
} from "./services/pricing";
export type { PurchasedEntitlement } from "./services/pricing";
export { MASS_EMAIL_BATCH } from "./services/email-limits";
export type { PortalContext, MemberContext } from "./types/portal-context";
