import { TRPCError } from "@trpc/server";
import { hackathons } from "@query/db";
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { callerIsAdmin } from "../../middleware/procedures";
import type { Context } from "../../context";

/**
 * Statuses only staff may see. A draft edition is one nobody outside the team
 * is meant to know exists yet.
 */
export const STAFF_ONLY_STATUSES: (typeof hackathons.$inferSelect)["status"][] =
  ["draft"];

/**
 * Refuses to serve anything belonging to a hackathon the caller cannot see.
 *
 * `getById` enforced this on the hackathon row itself, but its public children
 * — the schedule, the project gallery, the results — each queried by
 * hackathonId with no such check. Anyone holding the uuid could read an
 * unannounced edition's full timetable and submissions, which is exactly the
 * shape of leak that a "draft" status exists to prevent.
 *
 * NOT_FOUND rather than FORBIDDEN on purpose: telling an anonymous caller that
 * a hidden edition exists is most of the leak.
 */
export const assertHackathonVisible = async (
  ctx: Context,
  hackathonId: string,
) => {
  const row = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
    where: eq(hackathons.id, hackathonId),
    columns: { id: true, status: true },
  });

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found" });
  }

  if (!STAFF_ONLY_STATUSES.includes(row.status)) return;
  if (await callerIsAdmin(ctx)) return;

  throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found" });
};
