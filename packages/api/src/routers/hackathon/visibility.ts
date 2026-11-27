import type { DrizzleDB, hackathons } from "@query/db";
import { callerIsAdmin } from "../../middleware/procedures";
import type { Context } from "../../context";
import { notFound } from "../errors";

// Statuses only staff may see. A draft edition is one nobody outside the team
// is meant to know exists yet, so it stays out of a participant's browse list.
// "cancelled" is deliberately NOT hidden: both detail pages ship a Cancelled
// badge, and people who already registered need to see it is off.
export const STAFF_ONLY_STATUSES: (typeof hackathons.$inferSelect)["status"][] =
  ["draft"];

// Refuses to serve anything belonging to a hackathon the caller cannot see.
// `getById` enforced this on the hackathon row, but its public children — the
// schedule, the gallery, the results — each queried by hackathonId with no
// such check, so anyone holding the uuid could read an unannounced edition.
// NOT_FOUND rather than FORBIDDEN: saying a hidden edition exists is most of
// the leak.
export const assertHackathonVisible = async (
  ctx: Context,
  hackathonId: string,
) => {
  const row = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
    where: { id: hackathonId },
    columns: { id: true, status: true },
  });

  if (!row) {
    throw notFound("Hackathon not found");
  }

  if (!STAFF_ONLY_STATUSES.includes(row.status)) return;
  if (await callerIsAdmin(ctx)) return;

  throw notFound("Hackathon not found");
};
