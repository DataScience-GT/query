import { and, count, countDistinct, eq, isNull, sql } from "drizzle-orm";
import {
  judgingChallenges,
  judgingEntries,
  judgingEntryChallenges,
  judgingRoomLinks,
  judgingRooms,
  judgingRubricItems,
  judgingSchedules,
} from "@query/db";
import type { JudgingRoomKind } from "@query/db";
import { ensureJudgingConfig } from "./config";
import type { JudgingDb } from "./config";
import { outerColumn } from "./outer-column";

// The organiser's launch checklist: what has to be true before judges take
// their rooms and tables and hackers look up their times. Reads every area's
// tables directly; nothing here writes.

export type ChecklistFacts = {
  entries: { devpost: number; portal: number };
  ratingItems: number;
  groupsInitialized: boolean;
  /** Top-level scheduled challenges that have projects in them. */
  scheduledRoots: {
    label: string;
    rooms: {
      name: string;
      kind: JudgingRoomKind;
      hasBuilding: boolean;
      hasLink: boolean;
    }[];
  }[];
  scheduleSaved: boolean;
  state: "draft" | "open" | "closed";
  claimsStarted: boolean;
  itineraryPublished: boolean;
};

export type ChecklistItem = {
  key:
    | "projects"
    | "rubric"
    | "rooms"
    | "schedule"
    | "open"
    | "claims"
    | "itinerary";
  label: string;
  done: boolean;
  /** One line: what is there, or what to do next. */
  hint: string;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export type JudgingState = ChecklistFacts["state"];

/**
 * Why judging cannot move from `from` to `to`, or null when it can. Draft
 * opens once the rubric has a rating to give; open and closed swap freely;
 * going back to draft is only for before anyone has scored, drafts
 * included.
 */
export function stateChangeProblem(
  from: JudgingState,
  to: JudgingState,
  facts: { ratingItems: number; hasEvaluations: boolean },
): string | null {
  if (from === to) return null;
  if (to === "open") {
    return from === "draft" && facts.ratingItems === 0
      ? "Add at least one rating question to the rubric before opening judging."
      : null;
  }
  if (to === "closed") {
    return from === "draft"
      ? "Judging has not been opened yet, so there is nothing to close."
      : null;
  }
  return facts.hasEvaluations
    ? "Judges have started scoring, so judging cannot go back to draft. Close it instead, or drop evaluations from Resets."
    : null;
}

/**
 * Why the rubric cannot be edited now, or null when it can. Evaluations are
 * stored against its items, so it is fixed from the moment judging opens.
 */
export function rubricLockReason(facts: {
  state: JudgingState;
  scheduleSaved: boolean;
  hasEvaluations: boolean;
}): string | null {
  if (facts.hasEvaluations) {
    return "Judges have scored with this rubric. Drop evaluations from Resets to change it.";
  }
  if (facts.state !== "draft") {
    return "Judging has been opened, so the rubric is fixed. Set judging back to draft to edit it.";
  }
  if (facts.scheduleSaved) {
    return "A schedule is saved. Drop it on the Schedule tab to change the rubric.";
  }
  return null;
}

function roomsItem(facts: ChecklistFacts): Pick<ChecklistItem, "done" | "hint"> {
  if (facts.scheduledRoots.length === 0) {
    return {
      done: true,
      hint: "No scheduled challenge has projects yet, so no room or table is needed.",
    };
  }
  for (const root of facts.scheduledRoots) {
    if (root.rooms.length === 0) {
      return {
        done: false,
        hint: `${root.label} has no room or table. Add one on the Rooms tab.`,
      };
    }
    const room =
      root.rooms.find((r) => !r.hasBuilding) ??
      root.rooms.find((r) => !r.hasLink);
    if (room) {
      return {
        done: false,
        hint: room.hasBuilding
          ? `${room.name} has no QR link. Generate one on the Rooms tab.`
          : `${room.name} has no building. The schedule needs it to plan the walk between presentations.`,
      };
    }
  }
  const stations = facts.scheduledRoots.flatMap((r) => r.rooms);
  const tables = stations.filter((s) => s.kind === "table").length;
  const rooms = stations.length - tables;
  const counted = [
    rooms > 0 ? plural(rooms, "room") : null,
    tables > 0 ? plural(tables, "table") : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return {
    done: true,
    hint: `${counted} across ${plural(facts.scheduledRoots.length, "scheduled challenge")}, each with a building and a QR link.`,
  };
}

/** The checklist, in the order an organiser works through it. */
export function buildChecklist(facts: ChecklistFacts): ChecklistItem[] {
  const total = facts.entries.devpost + facts.entries.portal;
  const rubricReady = facts.ratingItems > 0 && facts.groupsInitialized;
  const rooms = roomsItem(facts);

  return [
    {
      key: "projects",
      label: "Projects imported",
      done: total > 0,
      hint:
        total > 0
          ? `${plural(total, "project")}: ${facts.entries.devpost} from Devpost, ${facts.entries.portal} from portal submissions.`
          : "Import the Devpost submissions export, or promote portal submissions.",
    },
    {
      key: "rubric",
      label: "Rubric and challenge groups ready",
      done: rubricReady,
      hint: !facts.groupsInitialized
        ? "Create the starter groups on the Challenges tab."
        : facts.ratingItems === 0
          ? "Add at least one rating question to the rubric."
          : `${plural(facts.ratingItems, "rating question")}; starter groups are in place.`,
    },
    {
      key: "rooms",
      label: "Rooms or tables set up for scheduled challenges",
      ...rooms,
    },
    {
      key: "schedule",
      label: "Schedule saved",
      done: facts.scheduleSaved,
      hint: facts.scheduleSaved
        ? "Judges and hackers see the saved times."
        : "Preview a schedule on the Schedule tab and save it.",
    },
    {
      key: "open",
      label: "Judging open",
      done: facts.state === "open",
      hint:
        facts.state === "open"
          ? "Judges can submit and edit evaluations."
          : facts.state === "closed"
            ? "Judging is closed. Reopen it to let judges submit again."
            : "Open judging when judges are ready to score.",
    },
    {
      key: "claims",
      label: "Claims started",
      done: facts.claimsStarted || facts.entries.devpost === 0,
      hint: facts.claimsStarted
        ? "Hackers have started claiming their Devpost projects."
        : facts.entries.devpost === 0
          ? "Every project came from the portal, so hackers are already linked."
          : "Email claim links so hackers can find their projects.",
    },
    {
      key: "itinerary",
      label: "Itinerary published",
      done: facts.itineraryPublished,
      hint: facts.itineraryPublished
        ? "Hackers can see where and when they present."
        : "Publish the itinerary once the schedule is final.",
    },
  ];
}

/** Gathers the checklist's facts for one edition. */
export async function readChecklistFacts(
  db: JudgingDb,
  hackathonId: string,
): Promise<ChecklistFacts> {
  const config = await ensureJudgingConfig(db, hackathonId);

  const [entryCounts, [ratings], [schedule], roots, rooms] = await Promise.all([
    db
      .select({ source: judgingEntries.source, value: count() })
      .from(judgingEntries)
      .where(
        and(
          eq(judgingEntries.hackathonId, hackathonId),
          isNull(judgingEntries.deletedAt),
        ),
      )
      .groupBy(judgingEntries.source),
    db
      .select({ value: count() })
      .from(judgingRubricItems)
      .where(
        and(
          eq(judgingRubricItems.hackathonId, hackathonId),
          eq(judgingRubricItems.kind, "rating"),
        ),
      ),
    db
      .select({ id: judgingSchedules.id })
      .from(judgingSchedules)
      .where(eq(judgingSchedules.hackathonId, hackathonId))
      .limit(1),
    // A root's projects arrive as opt-ins (plain challenges) or derived rows
    // (groups), so a membership row on the root is enough.
    db
      .select({
        id: judgingChallenges.id,
        label: judgingChallenges.label,
        entries: countDistinct(judgingEntries.id),
      })
      .from(judgingChallenges)
      .innerJoin(
        judgingEntryChallenges,
        eq(judgingEntryChallenges.challengeId, judgingChallenges.id),
      )
      .innerJoin(
        judgingEntries,
        and(
          eq(judgingEntries.id, judgingEntryChallenges.entryId),
          isNull(judgingEntries.deletedAt),
        ),
      )
      .where(
        and(
          eq(judgingChallenges.hackathonId, hackathonId),
          isNull(judgingChallenges.parentId),
          eq(judgingChallenges.mode, "scheduled"),
        ),
      )
      .groupBy(judgingChallenges.id, judgingChallenges.label),
    db
      .select({
        name: judgingRooms.name,
        kind: judgingRooms.kind,
        challengeId: judgingRooms.challengeId,
        hasBuilding: sql<boolean>`${judgingRooms.buildingId} is not null`,
        hasLink: sql<boolean>`exists (select 1 from ${judgingRoomLinks} where ${judgingRoomLinks.roomId} = ${outerColumn(judgingRooms, judgingRooms.id)} and ${judgingRoomLinks.revokedAt} is null)`,
      })
      .from(judgingRooms)
      .where(
        and(
          eq(judgingRooms.hackathonId, hackathonId),
          isNull(judgingRooms.archivedAt),
        ),
      )
      .orderBy(judgingRooms.displayOrder, judgingRooms.name),
  ]);

  const entries = { devpost: 0, portal: 0 };
  for (const row of entryCounts) entries[row.source] = row.value;

  return {
    entries,
    ratingItems: ratings?.value ?? 0,
    groupsInitialized: !!config.groupsInitializedAt,
    scheduledRoots: roots
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((root) => ({
        label: root.label,
        rooms: rooms
          .filter((room) => room.challengeId === root.id)
          .map(({ name, kind, hasBuilding, hasLink }) => ({
            name,
            kind,
            hasBuilding,
            hasLink,
          })),
      })),
    scheduleSaved: !!schedule,
    state: config.state,
    claimsStarted: !!config.claimsStartedAt,
    itineraryPublished: config.itineraryPublished,
  };
}
