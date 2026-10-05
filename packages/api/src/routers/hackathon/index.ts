import { mergeRouters } from "../../trpc";
import { hackathonCrudRouter } from "./crud";
import { hackathonRegistrationRouter } from "./registration";
import { hackathonAdminRouter } from "./admin";
import { hackathonEventsRouter } from "./events";
import { hackathonContentRouter } from "./content";
import { hackathonInterestRouter } from "./interest";
import { hackathonAnnounceRouter } from "./announce";
import { hackathonBansRouter } from "./bans";

export const hackathonRouter = mergeRouters(
  hackathonCrudRouter,
  hackathonRegistrationRouter,
  hackathonAdminRouter,
  hackathonEventsRouter,
  hackathonContentRouter,
  hackathonInterestRouter,
  hackathonAnnounceRouter,
  hackathonBansRouter,
);
