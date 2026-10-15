import { createTRPCRouter } from "../../trpc";
import { pointsAdminRouter } from "./admin";
import { pointsStoreRouter } from "./store";
import { pointsMeRouter } from "./me";

// Hackathon points: earned at events, adjusted by staff, spent at the store.
export const pointsRouter = createTRPCRouter({
  admin: pointsAdminRouter,
  store: pointsStoreRouter,
  me: pointsMeRouter,
});
