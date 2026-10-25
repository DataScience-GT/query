import { createTRPCRouter } from "../trpc";
import { checkoutProcedures } from "./stripe/checkout";
import { reconcileProcedures } from "./stripe/reconcile";
import { linkingProcedures } from "./stripe/linking";

export const stripeRouter = createTRPCRouter({
  ...checkoutProcedures,
  ...reconcileProcedures,
  ...linkingProcedures,
});
