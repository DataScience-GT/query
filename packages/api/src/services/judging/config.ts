import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { hackathons, judgingConfigs } from "@query/db";
import type { DrizzleDB } from "@query/db";

/** A transaction handle from `db.transaction`. */
export type JudgingTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

/** Either the pool or a transaction: every helper here works inside one. */
export type JudgingDb = DrizzleDB | JudgingTx;

export type JudgingConfig = typeof judgingConfigs.$inferSelect;

/**
 * The edition, or a NOT_FOUND an organiser can act on. Returns the columns
 * judging needs: the name (typed to confirm a reset) and the dates (claim links
 * expire when the event ends).
 */
export async function assertHackathonExists(db: JudgingDb, hackathonId: string) {
  const [hackathon] = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      startDate: hackathons.startDate,
      endDate: hackathons.endDate,
    })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!hackathon) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "That hackathon does not exist. Pick an edition from the judging page and try again.",
    });
  }

  return hackathon;
}

/**
 * The edition's judging config, created in its default state (draft, nothing
 * locked) the first time anything asks. Safe under concurrency: a second
 * caller's insert is a no-op and it reads the row the first one wrote.
 */
export async function ensureJudgingConfig(
  db: JudgingDb,
  hackathonId: string,
): Promise<JudgingConfig> {
  const [created] = await db
    .insert(judgingConfigs)
    .values({ hackathonId })
    .onConflictDoNothing({ target: judgingConfigs.hackathonId })
    .returning();
  if (created) return created;

  const [existing] = await db
    .select()
    .from(judgingConfigs)
    .where(eq(judgingConfigs.hackathonId, hackathonId))
    .limit(1);
  if (!existing) {
    // Only reachable if the hackathon row is gone: the insert above would have
    // hit its foreign key otherwise.
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That hackathon does not exist.",
    });
  }
  return existing;
}

/**
 * Locks the project inventory: from now on a Devpost import only adds, and
 * replacing it needs typed confirmation. Set by the first room link or the
 * first claim; later calls keep the first lock's time and author. Returns the
 * config as it stands after the call.
 */
export async function lockInventory(
  tx: JudgingDb,
  hackathonId: string,
  userId: string | null,
): Promise<JudgingConfig> {
  const config = await ensureJudgingConfig(tx, hackathonId);
  if (config.inventoryLockedAt) return config;

  const now = new Date();
  const [locked] = await tx
    .update(judgingConfigs)
    .set({ inventoryLockedAt: now, inventoryLockedById: userId, updatedAt: now })
    .where(
      and(
        eq(judgingConfigs.hackathonId, hackathonId),
        isNull(judgingConfigs.inventoryLockedAt),
      ),
    )
    .returning();

  // Someone else locked it between the read and the update.
  return locked ?? (await ensureJudgingConfig(tx, hackathonId));
}
