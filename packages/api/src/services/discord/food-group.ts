import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { hackathonParticipants, hackathons } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { FOOD_GROUPS, FOOD_GROUP_KEYS } from "./config";

type Counts = Map<string, number>;

/** The group with the fewest members; ties broken by `random` (0..1). */
export function pickFoodGroup(
  counts: Counts,
  random: () => number = Math.random,
): string {
  let min = Infinity;
  let tied: string[] = [];
  for (const { key } of FOOD_GROUPS) {
    const n = counts.get(key) ?? 0;
    if (n < min) {
      min = n;
      tied = [key];
    } else if (n === min) tied.push(key);
  }
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
}

type Tx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

/**
 * Balance rests on the hackathon row lock: every assignment for one hackathon
 * runs one at a time, reads the live per-group counts, and takes the group with
 * the fewest members. Two concurrent links cannot both read the same counts.
 */
async function lockAndCount(tx: Tx, hackathonId: string): Promise<Counts> {
  await tx
    .select({ id: hackathons.id })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .for("update");
  const rows = await tx
    .select({
      key: hackathonParticipants.foodGroup,
      n: sql<number>`count(*)::int`,
    })
    .from(hackathonParticipants)
    .where(
      and(
        eq(hackathonParticipants.hackathonId, hackathonId),
        inArray(hackathonParticipants.foodGroup, [...FOOD_GROUP_KEYS]),
      ),
    )
    .groupBy(hackathonParticipants.foodGroup);
  return new Map(rows.map((r) => [r.key as string, r.n]));
}

/** The participant's group, assigning one first if they have none. */
export async function ensureFoodGroup(
  db: DrizzleDB,
  hackathonId: string,
  participantId: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const counts = await lockAndCount(tx, hackathonId);
    const [row] = await tx
      .select({ foodGroup: hackathonParticipants.foodGroup })
      .from(hackathonParticipants)
      .where(eq(hackathonParticipants.id, participantId));
    if (row?.foodGroup && FOOD_GROUP_KEYS.includes(row.foodGroup)) {
      return row.foodGroup;
    }
    const key = pickFoodGroup(counts);
    await tx
      .update(hackathonParticipants)
      .set({ foodGroup: key })
      .where(eq(hackathonParticipants.id, participantId));
    return key;
  });
}

/**
 * Call after a mutation that can seat people (approved or checked_in) has
 * committed. Gives every seated participant without a group one, oldest
 * registration first, which also catches anybody accepted before this ran.
 * Never throws: the acceptance has already happened, and the hub assigns
 * lazily if this missed.
 */
export async function autoAssignFoodGroups(
  db: DrizzleDB,
  hackathonId: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const counts = await lockAndCount(tx, hackathonId);
      const missing = await tx
        .select({ id: hackathonParticipants.id })
        .from(hackathonParticipants)
        .where(
          and(
            eq(hackathonParticipants.hackathonId, hackathonId),
            inArray(hackathonParticipants.registrationStatus, [
              "approved",
              "checked_in",
            ]),
            isNull(hackathonParticipants.foodGroup),
          ),
        )
        .orderBy(asc(hackathonParticipants.registeredAt));
      const byKey = new Map<string, string[]>();
      for (const { id } of missing) {
        const key = pickFoodGroup(counts);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        byKey.set(key, [...(byKey.get(key) ?? []), id]);
      }
      for (const [key, ids] of byKey) {
        await tx
          .update(hackathonParticipants)
          .set({ foodGroup: key })
          .where(inArray(hackathonParticipants.id, ids));
      }
    });
  } catch (error) {
    // Deliberate operational logging: the only record that an acceptance went
    // through without the group assignment that should follow it.
    // oxlint-disable-next-line no-console
    console.error(
      `[Food groups] Auto-assign failed for hackathon ${hackathonId}:`,
      error,
    );
  }
}
