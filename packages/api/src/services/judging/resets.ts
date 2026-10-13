import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  judgingAnnouncements,
  judgingBuildings,
  judgingChallenges,
  judgingClaimLinks,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingJudges,
  judgingPlacements,
  judgingRooms,
  judgingRubricItems,
  judgingSchedules,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  initializeGroups,
  lockEdition,
  readSetupLock,
  rebuildDerivedMemberships,
} from "./challenges";
import { ensureJudgingConfig } from "./config";
import type { JudgingDb } from "./config";

// The organiser's way back. Each reset takes the hackathon's name typed out,
// runs in one transaction, and says what it removed. Entries are deleted
// outright here, portal ones included: team.submitProject reads a removed
// (soft-deleted) portal entry as an organiser pulling the project, and a
// reset is not that.

export type ResetInput = { hackathonId: string; confirmation: string };

async function lockConfirmedEdition(tx: JudgingDb, input: ResetInput) {
  const locked = await lockEdition(tx, input.hackathonId);
  if (input.confirmation.trim() !== locked.hackathon.name.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `That is not the hackathon's name. Type ${locked.hackathon.name} exactly to confirm.`,
    });
  }
  return locked;
}

async function hasRooms(tx: JudgingDb, hackathonId: string) {
  const [room] = await tx
    .select({ id: judgingRooms.id })
    .from(judgingRooms)
    .where(eq(judgingRooms.hackathonId, hackathonId))
    .limit(1);
  return !!room;
}

const refuse = (message: string) =>
  new TRPCError({ code: "PRECONDITION_FAILED", message });

/**
 * Every evaluation, draft and computed placing. The schedule stays, and can
 * be dropped again once nothing has been scored.
 */
export function dropEvaluations(db: DrizzleDB, input: ResetInput) {
  return db.transaction(async (tx) => {
    await lockConfirmedEdition(tx, input);
    const id = input.hackathonId;

    const drafts = await tx
      .delete(judgingEvaluationDrafts)
      .where(eq(judgingEvaluationDrafts.hackathonId, id))
      .returning({ id: judgingEvaluationDrafts.id });
    const evaluations = await tx
      .delete(judgingEvaluations)
      .where(eq(judgingEvaluations.hackathonId, id))
      .returning({ id: judgingEvaluations.id });
    const placements = await tx
      .delete(judgingPlacements)
      .where(eq(judgingPlacements.hackathonId, id))
      .returning({ id: judgingPlacements.id });
    await tx
      .update(judgingSchedules)
      .set({ firstResultAt: null })
      .where(eq(judgingSchedules.hackathonId, id));

    return {
      evaluations: evaluations.length,
      drafts: drafts.length,
      placements: placements.length,
    };
  });
}

/**
 * Every project, from both sources, and the challenges they brought. The
 * starter groups and any group an organiser made stay. Needs rooms, the
 * schedule and evaluations gone first, so nothing is removed by accident
 * along the way.
 */
export function resetProjects(db: DrizzleDB, input: ResetInput) {
  return db.transaction(async (tx) => {
    await lockConfirmedEdition(tx, input);
    const id = input.hackathonId;

    const lock = await readSetupLock(tx, id);
    if (lock.scheduleSaved) {
      throw refuse("Drop the saved schedule before resetting projects.");
    }
    if (lock.hasEvaluations) {
      throw refuse("Drop evaluations before resetting projects.");
    }
    if (await hasRooms(tx, id)) {
      throw refuse("Drop rooms before resetting projects.");
    }

    const entries = await tx
      .delete(judgingEntries)
      .where(eq(judgingEntries.hackathonId, id))
      .returning({ id: judgingEntries.id });
    const challenges = await tx
      .delete(judgingChallenges)
      .where(
        and(
          eq(judgingChallenges.hackathonId, id),
          eq(judgingChallenges.isGroup, false),
        ),
      )
      .returning({ id: judgingChallenges.id });
    await tx
      .update(judgingConfigs)
      .set({
        inventoryLockedAt: null,
        inventoryLockedById: null,
        claimsStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(judgingConfigs.hackathonId, id));

    return { entries: entries.length, challenges: challenges.length };
  });
}

/** Every room and announcement. Buildings stay for the next set of rooms. */
export function dropRooms(db: DrizzleDB, input: ResetInput) {
  return db.transaction(async (tx) => {
    await lockConfirmedEdition(tx, input);
    const id = input.hackathonId;

    const lock = await readSetupLock(tx, id);
    if (lock.scheduleSaved) {
      throw refuse(
        "The saved schedule seats projects in these rooms. Drop it on the Schedule tab first.",
      );
    }

    const announcements = await tx
      .delete(judgingAnnouncements)
      .where(eq(judgingAnnouncements.hackathonId, id))
      .returning({ id: judgingAnnouncements.id });
    const rooms = await tx
      .delete(judgingRooms)
      .where(eq(judgingRooms.hackathonId, id))
      .returning({ id: judgingRooms.id });

    return { rooms: rooms.length, announcements: announcements.length };
  });
}

/**
 * The challenge tree and rubric back to how a new edition starts: groups
 * deleted and re-seeded, every challenge at the top level and scheduled, no
 * rubric. Projects and their opt-ins stay.
 */
export function resetSetup(db: DrizzleDB, input: ResetInput) {
  return db.transaction(async (tx) => {
    const { config } = await lockConfirmedEdition(tx, input);
    const id = input.hackathonId;

    const lock = await readSetupLock(tx, id);
    if (lock.scheduleSaved) {
      throw refuse("Drop the saved schedule before resetting setup.");
    }
    if (lock.hasEvaluations) {
      throw refuse("Drop evaluations before resetting setup.");
    }
    if (await hasRooms(tx, id)) {
      throw refuse(
        "Rooms are tied to these challenges. Drop rooms before resetting setup.",
      );
    }

    await tx
      .delete(judgingEntryChallenges)
      .where(
        and(
          eq(judgingEntryChallenges.hackathonId, id),
          eq(judgingEntryChallenges.isOptIn, false),
        ),
      );
    await tx
      .update(judgingChallenges)
      .set({
        parentId: null,
        mode: "scheduled",
        isGeneral: false,
        importLabelMatch: null,
      })
      .where(
        and(
          eq(judgingChallenges.hackathonId, id),
          eq(judgingChallenges.isGroup, false),
        ),
      );
    const groups = await tx
      .delete(judgingChallenges)
      .where(
        and(
          eq(judgingChallenges.hackathonId, id),
          eq(judgingChallenges.isGroup, true),
        ),
      )
      .returning({ id: judgingChallenges.id });
    const rubric = await tx
      .delete(judgingRubricItems)
      .where(eq(judgingRubricItems.hackathonId, id))
      .returning({ id: judgingRubricItems.id });

    await initializeGroups(tx, id, { ...config, groupsInitializedAt: null });
    await rebuildDerivedMemberships(tx, id);

    return { groups: groups.length, rubricItems: rubric.length };
  });
}

/**
 * What hackers were shown and what they claimed: the itinerary goes back to
 * hidden, emergency mode off, Devpost claims and claim links cleared so
 * claiming starts over. Portal projects were linked when promoted and stay
 * linked.
 */
export function resetLaunch(db: DrizzleDB, input: ResetInput) {
  return db.transaction(async (tx) => {
    await lockConfirmedEdition(tx, input);
    const id = input.hackathonId;

    const links = await tx
      .delete(judgingClaimLinks)
      .where(eq(judgingClaimLinks.hackathonId, id))
      .returning({ id: judgingClaimLinks.id });

    const devpostEntries = tx
      .select({ id: judgingEntries.id })
      .from(judgingEntries)
      .where(
        and(
          eq(judgingEntries.hackathonId, id),
          eq(judgingEntries.source, "devpost"),
        ),
      );
    const unclaimed = await tx
      .update(judgingEntryMembers)
      .set({ userId: null, claimedAt: null })
      .where(
        and(
          eq(judgingEntryMembers.hackathonId, id),
          inArray(judgingEntryMembers.entryId, devpostEntries),
          or(
            isNotNull(judgingEntryMembers.userId),
            isNotNull(judgingEntryMembers.claimedAt),
          ),
        ),
      )
      .returning({ id: judgingEntryMembers.id });

    await tx
      .update(judgingConfigs)
      .set({
        itineraryPublished: false,
        emergencyMode: false,
        claimsStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(judgingConfigs.hackathonId, id));

    return { claimLinks: links.length, unclaimedMembers: unclaimed.length };
  });
}

/**
 * Everything judging holds for the edition, in one transaction, then the
 * starter groups again. Judges' accounts and the edition itself are
 * untouched; only their judging rows go.
 */
export function resetAll(db: DrizzleDB, input: ResetInput) {
  return db.transaction(async (tx) => {
    await lockConfirmedEdition(tx, input);
    const id = input.hackathonId;

    // Table by table so the result can say what went. Most of these would
    // also go by cascade from the rooms, judges and entries.
    const drafts = await tx
      .delete(judgingEvaluationDrafts)
      .where(eq(judgingEvaluationDrafts.hackathonId, id))
      .returning({ id: judgingEvaluationDrafts.id });
    const evaluations = await tx
      .delete(judgingEvaluations)
      .where(eq(judgingEvaluations.hackathonId, id))
      .returning({ id: judgingEvaluations.id });
    await tx
      .delete(judgingPlacements)
      .where(eq(judgingPlacements.hackathonId, id));
    const schedules = await tx
      .delete(judgingSchedules)
      .where(eq(judgingSchedules.hackathonId, id))
      .returning({ id: judgingSchedules.id });
    await tx
      .delete(judgingAnnouncements)
      .where(eq(judgingAnnouncements.hackathonId, id));
    const judges = await tx
      .delete(judgingJudges)
      .where(eq(judgingJudges.hackathonId, id))
      .returning({ id: judgingJudges.id });
    const rooms = await tx
      .delete(judgingRooms)
      .where(eq(judgingRooms.hackathonId, id))
      .returning({ id: judgingRooms.id });
    await tx
      .delete(judgingBuildings)
      .where(eq(judgingBuildings.hackathonId, id));
    const entries = await tx
      .delete(judgingEntries)
      .where(eq(judgingEntries.hackathonId, id))
      .returning({ id: judgingEntries.id });
    const challenges = await tx
      .delete(judgingChallenges)
      .where(eq(judgingChallenges.hackathonId, id))
      .returning({ id: judgingChallenges.id });
    await tx
      .delete(judgingRubricItems)
      .where(eq(judgingRubricItems.hackathonId, id));
    await tx.delete(judgingConfigs).where(eq(judgingConfigs.hackathonId, id));

    const config = await ensureJudgingConfig(tx, id);
    await initializeGroups(tx, id, config);

    return {
      entries: entries.length,
      challenges: challenges.length,
      rooms: rooms.length,
      judges: judges.length,
      evaluations: evaluations.length,
      drafts: drafts.length,
      scheduleDropped: schedules.length > 0,
    };
  });
}
