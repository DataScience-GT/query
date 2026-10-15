/**
 * Check-in rule-break flags at the judge desk. A judge, member or guest, is
 * told only that a team is flagged: one boolean on each project in the list and
 * on the project being judged. The hacker, the rule and the events stay with
 * organisers, so these tests read the whole serialized response for them.
 *
 * The router runs for real against a stand-in database that answers each
 * select by the tables it reads, which is also how the tests see what the desk
 * did and did not read.
 */
import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  hackathonCheckInFlags,
  hackathonEvents,
  hackathonParticipants,
  hackathonProjects,
  judgingChallenges,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingGuestSessions,
  judgingJudges,
  judges,
  judgingRoomLinks,
  judgingRooms,
  users,
} from "@query/db";
import { judgingDeskRouter } from "../routers/judging/desk";

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const CHALLENGE = "0c4a8e10-2b3d-4c5e-9f60-7a8b9c0d1e2f";
const JUDGE_ID = "1d5b9f21-3c4e-4d6f-8a70-8b9c0d1e2f3a";
const ROOM = "2e6ca032-4d5f-4e70-9b81-9c0d1e2f3a4b";

// The two projects on the desk. One belongs to the flagged hacker's team.
const FLAGGED_ENTRY = "3f7db143-5e60-4f81-8c92-0d1e2f3a4b5c";
const CLEAN_ENTRY = "40e8c254-6f71-4092-9da3-1e2f3a4b5c6d";

// Everything an organiser would see about the flag. None of it may reach a
// judge.
const FLAG_ID = "51f9d365-7082-41a3-8eb4-2f3a4b5c6d7e";
const PARTICIPANT_ID = "62a0e476-8193-42b4-9fc5-3a4b5c6d7e8f";
const HACKER_USER_ID = "73b1f587-92a4-43c5-80d6-4b5c6d7e8f90";
const FLAGGED_TEAM = "84c2a698-a3b5-44d6-91e7-5c6d7e8f90a1";
const OTHER_TEAM = "95d3b7a9-b4c6-45e7-a2f8-6d7e8f90a1b2";
const HACKER_EMAIL = "mia.okafor@example.com";
const HACKER_NAME = "Mia Okafor";
const TRIED_EVENT = "Opening Ceremony";
const CONFLICT_EVENT = "BNY Mellon Workshop";

const challenges = [
  {
    id: CHALLENGE,
    parentId: null,
    mode: "unscheduled",
    label: "General",
    isGeneral: true,
    isGroup: false,
  },
];

const entry = (id: string, title: string, participantCount: number) => ({
  id,
  title,
  description: "",
  submissionUrl: null,
  demoLinks: [],
  videoUrl: null,
  technologies: [],
  participantCount,
});

const flaggedEntry = entry(FLAGGED_ENTRY, "Tidewater", 3);
const cleanEntry = entry(CLEAN_ENTRY, "Quiet Garden", 2);

/** The key a stand-in answer is filed under: the table read, then its joins. */
const via = (from: unknown, ...joins: unknown[]) =>
  [from, ...joins].map((table) => getTableName(table as never)).join(">");

type Answers = Record<string, unknown[]>;

/**
 * A database whose selects resolve from `answers`, looked up by the tables the
 * query reads and defaulting to no rows. Every select is kept, so a test can
 * see which tables were read and how often.
 */
function fakeDb(answers: Answers) {
  const reads: { key: string; from: string; fields: string[] }[] = [];
  const db = {
    select: (fields: Record<string, unknown>) => {
      const joined: unknown[] = [];
      let from: unknown;
      const chain: Record<string, unknown> = {
        from: (table: unknown) => {
          from = table;
          return chain;
        },
        then: (
          ok: (rows: unknown[]) => unknown,
          fail: (error: unknown) => unknown,
        ) => {
          const key = via(from, ...joined);
          reads.push({
            key,
            from: getTableName(from as never),
            fields: Object.keys(fields ?? {}),
          });
          return Promise.resolve(answers[key] ?? []).then(ok, fail);
        },
      };
      for (const join of ["innerJoin", "leftJoin"]) {
        chain[join] = (table: unknown) => {
          joined.push(table);
          return chain;
        };
      }
      for (const method of ["where", "orderBy", "limit", "for"]) {
        chain[method] = () => chain;
      }
      return chain;
    },
  };
  return { db, reads };
}

/** What the desk reads before the project list or the project itself. */
const deskBasics = (): Answers => ({
  [via(judges)]: [{ name: "Grace Hopper" }],
  [via(judgingJudges)]: [{ id: JUDGE_ID, displayName: "Grace Hopper" }],
  [via(judgingChallenges)]: challenges,
});

/**
 * One open flag from a hacker on FLAGGED_TEAM. The rows for the tables only an
 * organiser's view reads are filled in too, so a desk that went and fetched
 * them would have something to leak.
 */
const flagRows = (
  opts: { portal?: unknown[]; members?: unknown[] } = {},
): Answers => ({
  [via(hackathonCheckInFlags, hackathonParticipants)]: [
    {
      id: FLAG_ID,
      participantId: PARTICIPANT_ID,
      teamId: FLAGGED_TEAM,
      userId: HACKER_USER_ID,
    },
  ],
  [via(judgingEntries, hackathonProjects)]: opts.portal ?? [
    { entryId: FLAGGED_ENTRY, teamId: FLAGGED_TEAM, submittedById: null },
    { entryId: CLEAN_ENTRY, teamId: OTHER_TEAM, submittedById: null },
  ],
  [via(judgingEntryMembers, judgingEntries)]: opts.members ?? [],
  [via(users)]: [{ id: HACKER_USER_ID, email: HACKER_EMAIL }],
  [via(hackathonEvents)]: [
    { id: "event-a", name: TRIED_EVENT },
    { id: "event-b", name: CONFLICT_EVENT },
  ],
});

const memberCtx = (db: unknown) =>
  ({
    db,
    session: { user: { id: "judge-user", name: "Grace Hopper" } },
    userId: "judge-user",
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  }) as never;

const guestAnswers = (): Answers => ({
  [via(judgingGuestSessions, judgingRoomLinks, judgingRooms, judgingJudges)]: [
    {
      sessionId: "session-1",
      hackathonId: HACK,
      linkId: "link-1",
      roomId: ROOM,
      roomChallengeId: CHALLENGE,
      judgeId: JUDGE_ID,
      displayName: "Guest Judge",
    },
  ],
  [via(judgingChallenges)]: challenges,
});

const guestCtx = (db: unknown) =>
  ({
    db,
    session: null,
    userId: undefined,
    clientIp: "127.0.0.2",
    req: {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "cookie"
            ? "query_judging_guest=guest-token"
            : null,
      },
    },
  }) as never;

/** Words and ids that only organisers may see. */
const organiserOnly = [
  "email",
  "userId",
  FLAG_ID,
  PARTICIPANT_ID,
  HACKER_USER_ID,
  FLAGGED_TEAM,
  HACKER_EMAIL,
  HACKER_NAME,
  TRIED_EVENT,
  CONFLICT_EVENT,
  "overlap",
  "too_soon",
  "attempts",
];

const expectNothingOrganiserOnly = (response: unknown) => {
  const serialized = JSON.stringify(response);
  for (const secret of organiserOnly) expect(serialized).not.toContain(secret);
};

/** The tables a desk read took data from, for the privacy checks. */
const tablesRead = (reads: { from: string }[]) =>
  new Set(reads.map((read) => read.from));

const flagReads = <T extends { from: string }>(reads: T[]) =>
  reads.filter((read) => read.from === getTableName(hackathonCheckInFlags));

const judgesUnderTest = [
  {
    kind: "member judge",
    answers: deskBasics,
    ctx: memberCtx,
  },
  {
    kind: "guest judge",
    answers: guestAnswers,
    ctx: guestCtx,
  },
] as const;

describe.each(judgesUnderTest)(
  "check-in flags at the desk for a $kind",
  ({ answers, ctx }) => {
    describe("desk.projects", () => {
      const listAnswers = (flags: Answers): Answers => ({
        ...answers(),
        [via(judgingEntries, judgingEntryChallenges)]: [
          { id: FLAGGED_ENTRY, title: "Tidewater", participantCount: 3 },
          { id: CLEAN_ENTRY, title: "Quiet Garden", participantCount: 2 },
        ],
        ...flags,
      });

      it("marks the flagged team's project true and the other false", async () => {
        const { db } = fakeDb(listAnswers(flagRows()));

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .projects({ hackathonId: HACK, inMyRoomOnly: false });

        const flagged = Object.fromEntries(
          result.projects.map((project) => [project.id, project.flagged]),
        );
        expect(flagged).toEqual({
          [FLAGGED_ENTRY]: true,
          [CLEAN_ENTRY]: false,
        });
      });

      it("marks a project flagged through a member row, as a Devpost entry is", async () => {
        const { db } = fakeDb(
          listAnswers(
            flagRows({
              portal: [],
              members: [{ entryId: CLEAN_ENTRY, userId: HACKER_USER_ID }],
            }),
          ),
        );

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .projects({ hackathonId: HACK, inMyRoomOnly: false });

        expect(
          result.projects.find((project) => project.id === CLEAN_ENTRY)
            ?.flagged,
        ).toBe(true);
        expect(
          result.projects.find((project) => project.id === FLAGGED_ENTRY)
            ?.flagged,
        ).toBe(false);
      });

      it("is false for every project when nobody is flagged", async () => {
        const { db } = fakeDb(listAnswers({}));

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .projects({ hackathonId: HACK, inMyRoomOnly: false });

        expect(result.projects).toHaveLength(2);
        expect(result.projects.map((project) => project.flagged)).toEqual([
          false,
          false,
        ]);
      });

      it("adds a boolean to each project and nothing else about the flag", async () => {
        const { db } = fakeDb(listAnswers(flagRows()));

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .projects({ hackathonId: HACK, inMyRoomOnly: false });

        for (const project of result.projects) {
          expect(typeof project.flagged).toBe("boolean");
          expect(Object.keys(project).sort()).toEqual([
            "challenges",
            "flagged",
            "hasDraft",
            "id",
            "myEvaluation",
            "participantCount",
            "presentation",
            "title",
          ]);
        }
        expectNothingOrganiserOnly(result);
      });

      it("asks for flags once for the whole list, not once per project", async () => {
        const { db, reads } = fakeDb(listAnswers(flagRows()));

        await judgingDeskRouter
          .createCaller(ctx(db))
          .projects({ hackathonId: HACK, inMyRoomOnly: false });

        expect(flagReads(reads)).toHaveLength(1);
      });

      it("never reads the people or events behind a flag", async () => {
        const { db, reads } = fakeDb(listAnswers(flagRows()));

        await judgingDeskRouter
          .createCaller(ctx(db))
          .projects({ hackathonId: HACK, inMyRoomOnly: false });

        const read = tablesRead(reads);
        expect(read.has(getTableName(users))).toBe(false);
        expect(read.has(getTableName(hackathonEvents))).toBe(false);
        // Only the flag's own ids are selected, never a name or an email.
        for (const select of flagReads(reads)) {
          expect(select.fields).toEqual([
            "id",
            "participantId",
            "teamId",
            "userId",
          ]);
        }
      });

      it("does not look for flags when there are no projects", async () => {
        const { db, reads } = fakeDb({ ...answers(), ...flagRows() });

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .projects({ hackathonId: HACK, inMyRoomOnly: false });

        expect(result.projects).toEqual([]);
        expect(flagReads(reads)).toHaveLength(0);
      });
    });

    describe("desk.project", () => {
      const sheetAnswers = (
        projectEntry: ReturnType<typeof entry>,
        flags: Answers,
      ): Answers => ({
        ...answers(),
        [via(judgingEntries, judgingEntryChallenges)]: [projectEntry],
        [via(judgingEntryMembers)]: [{ name: "Ada Lovelace" }],
        ...flags,
      });

      it("marks the flagged team's project true", async () => {
        const { db } = fakeDb(sheetAnswers(flaggedEntry, flagRows()));

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .project({ hackathonId: HACK, entryId: FLAGGED_ENTRY });

        expect(result.entry.flagged).toBe(true);
      });

      it("marks another team's project false", async () => {
        const { db } = fakeDb(sheetAnswers(cleanEntry, flagRows()));

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .project({ hackathonId: HACK, entryId: CLEAN_ENTRY });

        expect(result.entry.flagged).toBe(false);
      });

      it("is false when nobody is flagged", async () => {
        const { db } = fakeDb(sheetAnswers(flaggedEntry, {}));

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .project({ hackathonId: HACK, entryId: FLAGGED_ENTRY });

        expect(result.entry.flagged).toBe(false);
      });

      it("tells the judge nothing more than the boolean", async () => {
        const { db, reads } = fakeDb(sheetAnswers(flaggedEntry, flagRows()));

        const result = await judgingDeskRouter
          .createCaller(ctx(db))
          .project({ hackathonId: HACK, entryId: FLAGGED_ENTRY });

        expect(result.entry.flagged).toBe(true);
        expectNothingOrganiserOnly(result);
        const read = tablesRead(reads);
        expect(read.has(getTableName(users))).toBe(false);
        expect(read.has(getTableName(hackathonEvents))).toBe(false);
        expect(flagReads(reads)).toHaveLength(1);
      });
    });
  },
);
