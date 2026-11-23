import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";

/**
 * Real-Postgres test for the queries that the Drizzle 1.0 upgrade rewrote from
 * the builder's `where: eq(...)` form to the relational query's object form,
 * and for the two where clauses that hand-written SQL had to move into `RAW`.
 *
 * The mocked suites see the arguments of a query, never its result, so a
 * filter that quietly changed meaning (a lost `and`, an `isNull` that stopped
 * matching, a `%` that became a wildcard) passes all of them. Every expected
 * value below is derived from the rule the router states, by hand, from the
 * fixture. The file is written against the routers only, so it runs unchanged
 * on drizzle 0.45 and 1.0: a pass on both is the equivalence proof.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. Rows are inserted under a random suffix
 * and removed afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe.skipIf(!URL)("query semantics against a real database", () => {
  const s = Math.random().toString(36).slice(2, 8);
  const uid = (name: string) => `qs-${s}-${name}`;

  let S: typeof DbModule;
  let appRouter: any;
  let cache: any;
  let ownProjectWhere: (
    hackathonId: string,
    teamId: string | null | undefined,
    participantId: string,
  ) => any;

  let hOpen: string;
  let hDraft: string;
  let hDone: string;
  let hOther: string;

  // Participant ids by short name, and the team and project ids.
  const p: Record<string, string> = {};
  const team: Record<string, string> = {};
  const project: Record<string, string> = {};

  const ctx = (userId?: string) => ({
    db: S.db,
    session: userId ? { user: { id: userId } } : null,
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  });
  const asUser = (userId?: string) => appRouter.createCaller(ctx(userId));
  const admin = () => asUser(uid("admin"));

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ({ appRouter } = await import("../root"));
    ({ cache } = await import("../middleware/cache"));
    ({ ownProjectWhere } = await import("../routers/team/guards"));
    const db = S.db!;
    const now = Date.now();

    // Users. Emails are lower-case except the banned one, which keeps the
    // casing it was typed in, as some older rows do.
    const people = [
      "admin", "alice", "bob", "carol", "dan", "eve", "frank", "ban",
    ];
    await db.insert(S.users).values(
      people.map((name) => ({
        id: uid(name),
        name:
          name === "frank"
            ? "Quentin Quark"
            : name === "alice"
              ? "Alice Account"
              : `User ${name}`,
        email:
          name === "ban"
            ? `Ban-Me-${s}@Example.test`
            : name === "eve"
              ? `zed${s}@findme.test`
              : `${name}${s}@example.test`,
      })),
    );
    await db.insert(S.admins).values({
      userId: uid("admin"),
      role: "super_admin",
      isActive: true,
    });

    // Editions. startDate orders them; the filters are status, isPublic and
    // "starts in the future".
    const editions = [
      ["open", "open", true, 10 * DAY],
      ["draft", "draft", true, 5 * DAY],
      ["done", "completed", true, -30 * DAY],
      ["hidden", "open", false, 20 * DAY],
      ["announced", "announced", true, 40 * DAY],
      ["other", "open", true, 50 * DAY],
    ] as const;
    const rows = await db
      .insert(S.hackathons)
      .values(
        editions.map(([key, status, isPublic, offset]) => ({
          name: `qs ${s} ${key}`,
          status,
          isPublic,
          startDate: new Date(now + offset),
          endDate: new Date(now + offset + DAY),
        })),
      )
      .returning({ id: S.hackathons.id, name: S.hackathons.name });
    const byName = (key: string) =>
      rows.find((r) => r.name === `qs ${s} ${key}`)!.id;
    hOpen = byName("open");
    hDraft = byName("draft");
    hDone = byName("done");
    hOther = byName("other");

    // Teams: t1 (alice captain; alice and bob), t2 (carol), t3 on the finished
    // edition (dan is a member).
    const teams = await db
      .insert(S.hackathonTeams)
      .values([
        { hackathonId: hOpen, name: `t1 ${s}`, captainId: uid("alice") },
        { hackathonId: hOpen, name: `t2 ${s}`, captainId: uid("carol") },
        { hackathonId: hDone, name: `t3 ${s}`, captainId: uid("dan") },
      ])
      .returning({ id: S.hackathonTeams.id, name: S.hackathonTeams.name });
    for (const t of teams) team[t.name.split(" ")[0]!] = t.id;

    // Participants on the open edition, registered in this order, newest last.
    // `a_b` and `100%` are there to prove LIKE metacharacters stay literal.
    const confirmed = new Date(now - HOUR);
    const parts = [
      // key, user, first, last, school, whyAttend, status, confirmed, team, age
      ["alice", "alice", "Alice", "Anderson", "Georgia Tech", "I love data", "approved", null, "t1", 5],
      ["bob", "bob", "Bob", "Brown", "Emory", "to build", "approved", confirmed, "t1", 4],
      ["carol", "carol", "Carol", "100% Chen", "Duke", "hacking", "pending", null, "t2", 3],
      ["dan", "dan", "Dan", "A_B Davis", "MIT", "fun", "checked_in", null, null, 2],
      ["eve", "eve", "Eve", "Evans", "Rice", "A.B. matters", "approved", null, null, 1],
      ["frank", "frank", "Frank", "Fox", "UGA", "snacks", "waitlisted", null, null, 0],
    ] as const;
    const inserted = await db
      .insert(S.hackathonParticipants)
      .values(
        parts.map(
          ([, user, firstName, lastName, school, whyAttend, status, at, t, ago]) => ({
            hackathonId: hOpen,
            userId: uid(user),
            firstName,
            lastName,
            school,
            whyAttend,
            registrationStatus: status,
            attendanceConfirmedAt: at,
            teamId: t ? team[t] : null,
            registeredAt: new Date(now - (ago + 1) * HOUR),
          }),
        ),
      )
      .returning({
        id: S.hackathonParticipants.id,
        userId: S.hackathonParticipants.userId,
      });
    for (const r of inserted) p[r.userId.replace(`qs-${s}-`, "")] = r.id;

    // The same names on another edition, which no filter on hOpen may return.
    const [alien] = await db
      .insert(S.hackathonParticipants)
      .values({
        hackathonId: hOther,
        userId: uid("alice"),
        firstName: "Alice",
        lastName: "Anderson",
        registrationStatus: "approved",
      })
      .returning({ id: S.hackathonParticipants.id });
    p.alien = alien!.id;
    // Dan is also on the finished edition's team.
    const [danDone] = await db
      .insert(S.hackathonParticipants)
      .values({
        hackathonId: hDone,
        userId: uid("dan"),
        registrationStatus: "approved",
        teamId: team.t3,
      })
      .returning({ id: S.hackathonParticipants.id });
    p.danDone = danDone!.id;

    // Projects: the t1 entry (filed by alice), dan's solo entry, eve's solo
    // entry, t2's entry, and t3's entry on the finished edition.
    const projects = await db
      .insert(S.hackathonProjects)
      .values([
        { key: "t1", hackathonId: hOpen, teamId: team.t1!, by: p.alice!, status: "submitted", ago: 5 },
        { key: "dan", hackathonId: hOpen, teamId: null, by: p.dan!, status: "submitted", ago: 1 },
        { key: "eve", hackathonId: hOpen, teamId: null, by: p.eve!, status: "draft", ago: 3 },
        { key: "t2", hackathonId: hOpen, teamId: team.t2!, by: p.carol!, status: "judging", ago: 4 },
        { key: "t3", hackathonId: hDone, teamId: team.t3!, by: p.danDone!, status: "winner", ago: 2 },
      ].map((r) => ({
        hackathonId: r.hackathonId,
        teamId: r.teamId,
        submittedById: r.by,
        name: `${r.key} ${s}`,
        description: "d",
        status: r.status as "submitted",
        submittedAt: new Date(now - r.ago * HOUR),
      })))
      .returning({ id: S.hackathonProjects.id, name: S.hackathonProjects.name });
    for (const r of projects) project[r.name.split(" ")[0]!] = r.id;

    // Bans, newest last. Ban emails are lower-case; the account's is not.
    await db.insert(S.hackathonBans).values([
      {
        email: `ban-me-${s}@example.test`,
        reason: "spam",
        bannedBy: uid("admin"),
        createdAt: new Date(now - 2 * HOUR),
      },
      {
        email: `nobody-${s}@example.test`,
        reason: "no account",
        createdAt: new Date(now - HOUR),
      },
    ]);

    // Payments for alice's address: one claimable, one already linked, one
    // unpaid. Bob's address has only a linked one.
    await db.insert(S.stripePayments).values([
      { stripeSessionId: `cs-${s}-1`, customerEmail: `alice${s}@example.test`, paymentStatus: "paid" },
      { stripeSessionId: `cs-${s}-2`, customerEmail: `alice${s}@example.test`, paymentStatus: "paid", linkedUserId: uid("carol") },
      { stripeSessionId: `cs-${s}-3`, customerEmail: `alice${s}@example.test`, paymentStatus: "unpaid" },
      { stripeSessionId: `cs-${s}-4`, customerEmail: `bob${s}@example.test`, paymentStatus: "paid", linkedUserId: uid("carol") },
    ]);
  }, 120_000);

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    const { inArray, like } = await import("drizzle-orm");
    await db
      .delete(S.hackathons)
      .where(like(S.hackathons.name, `qs ${s} %`));
    await db
      .delete(S.hackathonBans)
      .where(like(S.hackathonBans.email, `%${s}@example.test`));
    await db
      .delete(S.stripePayments)
      .where(like(S.stripePayments.stripeSessionId, `cs-${s}-%`));
    await db.delete(S.users).where(
      inArray(
        S.users.id,
        [
          "admin", "alice", "bob", "carol", "dan", "eve", "frank", "ban",
        ].map(uid),
      ),
    );
  }, 120_000);

  beforeEach(() => {
    cache.clear();
  });

  // ---------------------------------------------------------------------
  describe("the attendee roster", () => {
    // Newest registration first. The open edition's six, in that order.
    const NEWEST_FIRST = ["frank", "eve", "dan", "carol", "bob", "alice"];

    const ids = (keys: string[]) => keys.map((k) => p[k]);

    const rosterKeys = async (input: Record<string, unknown>) => {
      const res = await admin().hackathon.adminGetAttendees({
        hackathonId: hOpen,
        limit: 50,
        ...input,
      });
      return res;
    };

    // The three endpoints share one filter, and the file must match the list.
    const sameEverywhere = async (
      input: Record<string, unknown>,
      expected: string[],
    ) => {
      const page = await rosterKeys(input);
      expect(page.attendees.map((a: any) => a.id)).toEqual(ids(expected));
      expect(page.matching).toBe(expected.length);

      const all = await admin().hackathon.adminGetAttendeeIds({
        hackathonId: hOpen,
        ...input,
      });
      expect([...all].sort()).toEqual([...ids(expected)].sort());

      const exported = await admin().hackathon.exportAttendees({
        hackathonId: hOpen,
        ...input,
      });
      expect(exported.map((a: any) => a.id)).toEqual(ids(expected));
    };

    it("lists one edition, newest registration first, nobody from another", async () => {
      await sameEverywhere({}, NEWEST_FIRST);
    });

    it("filters by status", async () => {
      await sameEverywhere({ status: "approved" }, ["eve", "bob", "alice"]);
      await sameEverywhere({ status: "waitlisted" }, ["frank"]);
    });

    it("unconfirmedOnly keeps approved people with no answer, not the confirmed or checked-in", async () => {
      await sameEverywhere({ unconfirmedOnly: true }, ["eve", "alice"]);
    });

    it("unconfirmedOnly and a contradictory status match nothing", async () => {
      await sameEverywhere({ unconfirmedOnly: true, status: "pending" }, []);
    });

    it("searches the applicant's name, school, essay and the account's name and email, ignoring case", async () => {
      await sameEverywhere({ search: "alice" }, ["alice"]);
      await sameEverywhere({ search: "ANDERSON" }, ["alice"]);
      await sameEverywhere({ search: "emory" }, ["bob"]);
      await sameEverywhere({ search: "snacks" }, ["frank"]);
      // Account fields: the account name, the account email.
      await sameEverywhere({ search: "quentin" }, ["frank"]);
      await sameEverywhere({ search: "findme" }, ["eve"]);
    });

    it("treats % and _ as the characters themselves, not wildcards", async () => {
      await sameEverywhere({ search: "%" }, ["carol"]);
      await sameEverywhere({ search: "_" }, ["dan"]);
      // `a_b` as a wildcard would also match Eve's "A.B.".
      await sameEverywhere({ search: "a_b" }, ["dan"]);
      await sameEverywhere({ search: "100%" }, ["carol"]);
    });

    it("combines search with status and unconfirmedOnly", async () => {
      await sameEverywhere({ search: "a", status: "approved" }, ["eve", "bob", "alice"]);
      await sameEverywhere({ search: "evans", unconfirmedOnly: true }, ["eve"]);
      await sameEverywhere({ search: "brown", unconfirmedOnly: true }, []);
    });

    it("pages with limit and offset and still reports the whole match count", async () => {
      const res = await rosterKeys({ limit: 2, offset: 1 });
      expect(res.attendees.map((a: any) => a.id)).toEqual(ids(["eve", "dan"]));
      expect(res.matching).toBe(6);
    });

    it("nests the account and returns real dates and arrays", async () => {
      const res = await rosterKeys({ search: "alice" });
      const row = res.attendees[0];
      expect(row.user).toMatchObject({
        id: uid("alice"),
        name: "Alice Account",
        email: `alice${s}@example.test`,
      });
      expect(row.registeredAt).toBeInstanceOf(Date);
      expect(row.attendanceConfirmedAt).toBeNull();
      expect(row.hasStoredResume).toBe(false);
      // Columns the roster leaves out stay out.
      expect(row).not.toHaveProperty("pronouns");
      expect(row).not.toHaveProperty("teamId");
    });
  });

  // ---------------------------------------------------------------------
  describe("hackathon.list", () => {
    const mine = (list: { name: string }[]) =>
      list
        .filter((h) => h.name.startsWith(`qs ${s} `))
        .map((h) => h.name.replace(`qs ${s} `, ""));

    const publicList = (input: Record<string, unknown> = {}) =>
      asUser().hackathon.list({ limit: 100, ...input });
    const adminList = (input: Record<string, unknown> = {}) =>
      admin().hackathon.list({ limit: 100, ...input });

    it("shows the public only public editions that are not staff-only, newest start first", async () => {
      expect(mine(await publicList())).toEqual([
        "other",
        "announced",
        "open",
        "done",
      ]);
    });

    it("shows staff every edition, including hidden and draft", async () => {
      expect(mine(await adminList())).toEqual([
        "other",
        "announced",
        "hidden",
        "open",
        "draft",
        "done",
      ]);
    });

    it("filters by status for both audiences", async () => {
      expect(mine(await publicList({ status: "open" }))).toEqual([
        "other",
        "open",
      ]);
      expect(mine(await adminList({ status: "open" }))).toEqual([
        "other",
        "hidden",
        "open",
      ]);
      expect(mine(await publicList({ status: "completed" }))).toEqual(["done"]);
    });

    it("never shows a staff-only status to the public, even when asked for it", async () => {
      expect(mine(await publicList({ status: "draft" }))).toEqual([]);
      expect(mine(await adminList({ status: "draft" }))).toEqual(["draft"]);
    });

    it("upcoming drops editions that already started", async () => {
      expect(mine(await publicList({ upcoming: true }))).toEqual([
        "other",
        "announced",
        "open",
      ]);
      expect(mine(await adminList({ upcoming: true }))).toEqual([
        "other",
        "announced",
        "hidden",
        "open",
        "draft",
      ]);
      expect(
        mine(await publicList({ upcoming: true, status: "completed" })),
      ).toEqual([]);
    });

    it("counts only approved and checked-in participants as seats, on the same page", async () => {
      const list = await publicList();
      const open = list.find((h: any) => h.name === `qs ${s} open`);
      // alice, bob, eve approved, dan checked in; carol pending, frank waitlisted.
      expect(open.currentParticipants).toBe(4);
      expect(
        list.find((h: any) => h.name === `qs ${s} announced`)
          .currentParticipants,
      ).toBe(0);
      expect(open.startDate).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------
  describe("hackathon.listBans", () => {
    it("lists newest first and resolves names case-insensitively", async () => {
      const bans = (await admin().hackathon.listBans()).filter((b: any) =>
        b.email.endsWith(`${s}@example.test`),
      );
      expect(bans.map((b: any) => b.email)).toEqual([
        `nobody-${s}@example.test`,
        `ban-me-${s}@example.test`,
      ]);
      expect(bans[0]).toMatchObject({
        name: null,
        hasAccount: false,
        bannedBy: null,
        reason: "no account",
      });
      // The account kept mixed case; the ban is lower-case; they still match.
      expect(bans[1]).toMatchObject({
        name: "User ban",
        hasAccount: true,
        bannedBy: "User admin",
      });
      expect(bans[1].createdAt).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------
  describe("team.myProjects and ownProjectWhere", () => {
    const names = (rows: { name: string }[]) =>
      rows.map((r) => r.name.split(" ")[0]);

    it("gives a team member the team's project", async () => {
      expect(names(await asUser(uid("alice")).team.myProjects())).toEqual(["t1"]);
      expect(names(await asUser(uid("bob")).team.myProjects())).toEqual(["t1"]);
    });

    it("gives a solo hacker their own entry, and a team member on another edition theirs, newest submission first", async () => {
      // dan: solo entry on the open edition (1h ago), t3's entry on the
      // finished one (2h ago).
      expect(names(await asUser(uid("dan")).team.myProjects())).toEqual([
        "dan",
        "t3",
      ]);
    });

    it("includes a draft the caller filed, and nobody else's", async () => {
      expect(names(await asUser(uid("eve")).team.myProjects())).toEqual(["eve"]);
    });

    it("matches nothing for a caller with no registration or no project", async () => {
      expect(await asUser(uid("frank")).team.myProjects()).toEqual([]);
      expect(await asUser(uid("ban")).team.myProjects()).toEqual([]);
    });

    it("never leaks the participant id behind an event pass", async () => {
      const [row] = await asUser(uid("dan")).team.myProjects();
      expect(row).not.toHaveProperty("submittedById");
    });

    it("nests the team and gives a solo entry none", async () => {
      const mineRows = await asUser(uid("dan")).team.myProjects();
      expect(mineRows[0].team).toBeNull();
      expect(mineRows[1].team).toMatchObject({ id: team.t3, name: `t3 ${s}` });
    });

    it("ownProjectWhere finds a team's entry, and a solo one only with no team", async () => {
      const db = S.db!;
      const find = (hackathonId: string, teamId: string | null, by: string) =>
        db.query.hackathonProjects.findFirst({
          where: ownProjectWhere(hackathonId, teamId, by),
          columns: { id: true },
        });

      expect((await find(hOpen, team.t1!, p.alice!))?.id).toBe(project.t1);
      // The team wins whoever asks: bob did not file it.
      expect((await find(hOpen, team.t1!, p.bob!))?.id).toBe(project.t1);
      expect((await find(hOpen, null, p.dan!))?.id).toBe(project.dan);
      // Alice filed the team's entry, but without a team she owns no solo one.
      expect(await find(hOpen, null, p.alice!)).toBeUndefined();
      // Another edition's team is not this edition's entry.
      expect(await find(hDone, team.t1!, p.alice!)).toBeUndefined();
      // A solo lookup on the wrong edition finds nothing.
      expect(await find(hDone, null, p.dan!)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------
  describe("public project lists", () => {
    it("getPublicProjects returns submitted, judging and winner entries only, newest first", async () => {
      const rows = await asUser().hackathon.getPublicProjects({
        hackathonId: hOpen,
      });
      // eve's is a draft. Newest first: dan 1h, t2 4h, t1 5h.
      expect(rows.map((r: any) => r.name.split(" ")[0])).toEqual([
        "dan",
        "t2",
        "t1",
      ]);
      expect(rows[0]).not.toHaveProperty("submittedById");
      expect(rows[2].team).toEqual({ id: team.t1, name: `t1 ${s}` });
      expect(rows[0].team).toBeNull();
    });

    it("getPublicProjects pages", async () => {
      const rows = await asUser().hackathon.getPublicProjects({
        hackathonId: hOpen,
        limit: 1,
        offset: 1,
      });
      expect(rows.map((r: any) => r.name.split(" ")[0])).toEqual(["t2"]);
    });

    it("projects nests team, participants and accounts with only the allowed columns", async () => {
      const rows = await asUser().hackathon.projects({ hackathonId: hOpen });
      const t1 = rows.find((r: any) => r.name === `t1 ${s}`);
      // The public sees submitted work only; staff also see eve's draft.
      expect(rows).toHaveLength(3);
      expect(
        await admin().hackathon.projects({ hackathonId: hOpen }),
      ).toHaveLength(4);
      expect(t1).not.toHaveProperty("submittedById");
      expect(t1.team.participants).toHaveLength(2);
      for (const participant of t1.team.participants) {
        expect(Object.keys(participant).sort()).toEqual([
          "hackathonId",
          "teamId",
          "user",
          "userId",
        ]);
        expect(Object.keys(participant.user).sort()).toEqual([
          "id",
          "image",
          "name",
        ]);
      }
      expect(
        t1.team.participants.map((x: any) => x.userId).sort(),
      ).toEqual([uid("alice"), uid("bob")].sort());
    });

    it("hides every edition's children from the public when it is staff-only", async () => {
      await expect(
        asUser().hackathon.getPublicProjects({ hackathonId: hDraft }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      // Staff may read it.
      expect(
        await admin().hackathon.getPublicProjects({ hackathonId: hDraft }),
      ).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  describe("payment linking", () => {
    it("finds a paid, unlinked payment by the account's address", async () => {
      const res = await asUser(uid("alice")).stripe.checkPendingPayment();
      expect(res.hasPendingPayment).toBe(true);
      expect(res.paymentId).toBeTruthy();
    });

    it("ignores linked and unpaid payments", async () => {
      // Bob's only payment is already linked.
      expect(
        (await asUser(uid("bob")).stripe.checkPendingPayment()).hasPendingPayment,
      ).toBe(false);
      // Carol has no payment under her address at all.
      expect(
        (await asUser(uid("carol")).stripe.checkPendingPayment()).hasPendingPayment,
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  describe("judge.list", () => {
    // An optional filter left out must mean "no filter": rc.6 throws on
    // `where: undefined` instead of skipping it.
    it("lists judges with no edition given", async () => {
      expect(Array.isArray(await admin().judge.list())).toBe(true);
      expect(
        Array.isArray(await admin().judge.list({ hackathonId: hOpen })),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  describe("what the driver hands back", () => {
    it("decodes nested timestamps, booleans and numbers the same way", async () => {
      const row = await asUser(uid("alice")).hackathon.myParticipantRecord({
        hackathonId: hOpen,
      });
      expect(row.registeredAt).toBeInstanceOf(Date);
      expect(row.team.createdAt).toBeInstanceOf(Date);
      expect(row.dietaryRestrictions).toBeNull();
      expect(typeof row.hasSubmittedProject).toBe("boolean");
      expect(typeof row.team.maxMembers).toBe("number");
    });

    it("returns undefined, not null, for a findFirst with no row", async () => {
      expect(
        await asUser(uid("ban")).hackathon.myParticipantRecord({
          hackathonId: hOpen,
        }),
      ).toBeUndefined();
    });
  });
});
