import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";
import type * as DiscordSvc from "../services/discord";

/**
 * Real-Postgres test for the Discord link: balanced food groups, the
 * Linked Roles callback with a mocked fetch (Discord is never called), who may
 * link (confirmed hackers, approved judges, volunteers), the default edition
 * for the verification URL, unlink, and the admin bits.
 * Needs TEST_DATABASE_URL (disposable; never Neon or production).
 */
const URL = process.env.TEST_DATABASE_URL;

type FetchCall = { url: string; init?: RequestInit };

// The mass-accept path mails each person through a dynamic import; nothing
// here may reach a real mail provider.
vi.mock("@query/auth/email", () => ({ sendAcceptanceEmail: vi.fn(async () => {}) }));

describe.skipIf(!URL)("discord link against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const userIds: string[] = [];
  const hackathonIds: string[] = [];

  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let appRouter: any;
  let ctx: any;
  let svc: typeof DiscordSvc;

  const CONFIG = {
    clientId: "client-1",
    clientSecret: "secret-1",
    inviteUrl: "https://discord.gg/test",
  };

  const makeUser = async (tag: string) => {
    const id = `dl-${suffix}-${tag}`;
    await S.db!
      .insert(S.users)
      .values({ id, email: `${id}@example.test`, name: `User ${tag}` });
    userIds.push(id);
    return id;
  };
  const makeHackathon = async (tag: string, extra: Record<string, unknown> = {}) => {
    const [row] = await S.db!
      .insert(S.hackathons)
      .values({
        name: `DL ${suffix} ${tag}`,
        startDate: new Date("2027-02-26T14:00:00Z"),
        endDate: new Date("2027-02-28T17:00:00Z"),
        status: "open",
        ...extra,
      })
      .returning();
    hackathonIds.push(row!.id);
    return row!;
  };
  const makeParticipant = async (
    hackathonId: string,
    userId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const [row] = await S.db!
      .insert(S.hackathonParticipants)
      .values({
        hackathonId,
        userId,
        registrationStatus: "approved",
        // Said "I'm coming": the Discord step waits for it.
        attendanceConfirmedAt: new Date(),
        ramadanFasting: "Yes",
        ...extra,
      })
      .returning();
    return row!;
  };
  const row = async (id: string) =>
    (
      await S.db!
        .select()
        .from(S.hackathonParticipants)
        .where(ops.eq(S.hackathonParticipants.id, id))
    )[0]!;

  /** A Discord that answers each step, recording every call. */
  const discordFetch = (
    over: { token?: number; me?: number; put?: number; meId?: string } = {},
  ) => {
    const calls: FetchCall[] = [];
    const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status });
      if (u.endsWith("/oauth2/token")) {
        const status = over.token ?? 200;
        return status === 200
          ? json(200, { access_token: "tok-user" })
          : json(status, { retry_after: 4.2 });
      }
      if (u.endsWith("/users/@me")) {
        const status = over.me ?? 200;
        return status === 200
          ? json(200, {
              id: over.meId ?? `d-${suffix}`,
              username: "ada",
              global_name: "Ada L",
            })
          : json(status, {});
      }
      const status = over.put ?? 200;
      return json(status, status === 200 ? {} : { retry_after: 2 });
    });
    return { fn: fn as unknown as typeof fetch, calls };
  };

  const hackathonAs = (userId: string) =>
    appRouter.createCaller(ctx(userId)).hackathon;

  const ramadanSent = (f: ReturnType<typeof discordFetch>) =>
    JSON.parse(f.calls[2]!.init!.body as string).metadata.ramadan;

  const state = (u: string, h: string, r: 0 | 1 | null = null, t: "invite" | "portal" = "portal") =>
    ({ u, h, r, t, n: "n", e: Date.now() + 60_000 }) as const;

  const link = (
    userId: string,
    hackathonId: string,
    f: ReturnType<typeof discordFetch>,
    r: 0 | 1 | null = null,
    t: "invite" | "portal" = "portal",
  ) =>
    svc.completeLink({
      db: S.db as any,
      config: CONFIG,
      state: state(userId, hackathonId, r, t),
      code: "code-1",
      redirectUri: "https://datasciencegt.org/api/discord/callback",
      fetchImpl: f.fn,
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    svc = await import("../services/discord");
    ({ appRouter } = await import("../root"));
    const { cache } = await import("../middleware/cache");
    ctx = (userId: string) => ({
      db: S.db,
      session: { user: { id: userId } },
      userId,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    });
  }, 120_000);

  afterAll(async () => {
    const db = S?.db;
    if (!db) return;
    if (hackathonIds.length) {
      await db.delete(S.hackathons).where(ops.inArray(S.hackathons.id, hackathonIds));
    }
    if (userIds.length) {
      await db.delete(S.auditLogs).where(ops.inArray(S.auditLogs.userId, userIds));
      await db.delete(S.users).where(ops.inArray(S.users.id, userIds));
    }
  });

  it("keeps groups within 1 under sequential and concurrent assignment", async () => {
    const h = await makeHackathon("balance");
    const ids: string[] = [];
    for (let i = 0; i < 80; i++) {
      const u = await makeUser(`bal${i}`);
      ids.push((await makeParticipant(h.id, u)).id);
    }
    // 24 one at a time, then the other 56 all at once.
    for (const id of ids.slice(0, 24)) await svc.ensureFoodGroup(S.db as any, h.id, id);
    await Promise.all(
      ids.slice(24).map((id) => svc.ensureFoodGroup(S.db as any, h.id, id)),
    );
    const rows = await S.db!
      .select({ g: S.hackathonParticipants.foodGroup })
      .from(S.hackathonParticipants)
      .where(ops.eq(S.hackathonParticipants.hackathonId, h.id));
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.g!, (counts.get(r.g!) ?? 0) + 1);
    const sizes = svc.FOOD_GROUPS.map((g) => counts.get(g.key) ?? 0);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(80);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  }, 60_000);

  it("is idempotent: a participant keeps the group they have", async () => {
    const h = await makeHackathon("idem");
    const p = await makeParticipant(h.id, await makeUser("idem"));
    const first = await svc.ensureFoodGroup(S.db as any, h.id, p.id);
    expect(await svc.ensureFoodGroup(S.db as any, h.id, p.id)).toBe(first);
  });

  it("callback happy path publishes role-connection metadata and no guild calls", async () => {
    const h = await makeHackathon("happy");
    const u = await makeUser("happy");
    const p = await makeParticipant(h.id, u);
    const f = discordFetch({ meId: `d-happy-${suffix}` });
    const res = await link(u, h.id, f, 1, "invite");
    expect(res).toMatchObject({ ok: true, then: "invite", username: "ada" });

    expect(f.calls.map((c) => c.url)).toEqual([
      "https://discord.com/api/v10/oauth2/token",
      "https://discord.com/api/v10/users/@me",
      "https://discord.com/api/v10/users/@me/applications/client-1/role-connection",
    ]);
    expect(f.calls.some((c) => c.url.includes("/guilds/"))).toBe(false);
    const init = f.calls[2]!.init as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer tok-user");
    const body = JSON.parse(init.body);
    const stored = await row(p.id);
    const number = svc.foodGroupByKey(stored.foodGroup)!.number;
    expect(body).toEqual({
      platform_name: "Hacklytics",
      platform_username: "Ada L",
      metadata: {
        accepted: 1,
        food_group: number,
        ramadan: 1,
        judge: 0,
        volunteer: 0,
      },
    });
    expect(stored).toMatchObject({
      discordUserId: `d-happy-${suffix}`,
      discordUsername: "ada",
      ramadanRoleOptIn: true,
    });
    expect(stored.discordLinkedAt).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain("tok-user");
  });

  it("sends ramadan 0 when not opted in, or when not fasting", async () => {
    const h = await makeHackathon("ram");
    const a = await makeUser("ram-a");
    await makeParticipant(h.id, a);
    const fa = discordFetch({ meId: `d-ra-${suffix}` });
    await link(a, h.id, fa, 0);
    expect(ramadanSent(fa)).toBe(0);

    const b = await makeUser("ram-b");
    await makeParticipant(h.id, b, { ramadanFasting: "No" });
    const fb = discordFetch({ meId: `d-rb-${suffix}` });
    await link(b, h.id, fb, 1);
    expect(ramadanSent(fb)).toBe(0);
  });

  it("keeps the stored opt-in when the flow gives none (verification URL)", async () => {
    const h = await makeHackathon("keep");
    const u = await makeUser("keep");
    await makeParticipant(h.id, u, { ramadanRoleOptIn: true });
    const f = discordFetch({ meId: `d-keep-${suffix}` });
    await link(u, h.id, f, null);
    expect(ramadanSent(f)).toBe(1);
  });

  it("refuses participants who are not accepted", async () => {
    const h = await makeHackathon("refuse");
    for (const status of ["pending", "waitlisted", "rejected"]) {
      const u = await makeUser(`refuse-${status}`);
      await makeParticipant(h.id, u, { registrationStatus: status });
      const f = discordFetch();
      expect(await link(u, h.id, f)).toEqual({ ok: false, reason: "not_accepted" });
      expect(f.calls).toHaveLength(0);
    }
    const stranger = await makeUser("stranger");
    expect(await link(stranger, h.id, discordFetch())).toMatchObject({
      reason: "not_accepted",
    });
  });

  describe("who may link: hackers who confirmed, approved judges, volunteers", () => {
    const makeJudge = async (hackathonId: string, userId: string, isActive = true) => {
      const [judge] = await S.db!
        .insert(S.judges)
        .values({ userId, hackathonId, name: "Judge", email: `${userId}@example.test`, isActive })
        .returning();
      return judge!;
    };
    const makeVolunteer = async (userId: string, extra: Record<string, unknown> = {}) => {
      await S.db!.insert(S.admins).values({ userId, role: "volunteer", ...extra });
    };
    const sent = (f: ReturnType<typeof discordFetch>) =>
      JSON.parse(f.calls[2]!.init!.body as string).metadata;
    const linkRow = async (userId: string) =>
      (
        await S.db!
          .select()
          .from(S.discordLinks)
          .where(ops.eq(S.discordLinks.userId, userId))
      )[0];

    it("an accepted hacker who has not said they are coming cannot link or get an invite", async () => {
      const h = await makeHackathon("rsvp");
      const u = await makeUser("rsvp");
      const p = await makeParticipant(h.id, u, { attendanceConfirmedAt: null });
      const f = discordFetch();
      expect(await link(u, h.id, f, null, "invite")).toEqual({
        ok: false,
        reason: "not_accepted",
      });
      expect(f.calls).toHaveLength(0);
      expect(await svc.resolveConnectTarget(S.db as any, u, h.id)).toBeNull();
      expect(await svc.resolveConnectTarget(S.db as any, u, null)).toBeNull();

      // The portal still shows them their flower (it is their meal wave) and
      // asks for the answer.
      const mine = await hackathonAs(u).myDiscord({ hackathonId: h.id });
      expect(mine).toMatchObject({
        eligible: false,
        awaitingConfirmation: true,
        roles: { hacker: false, judge: false, volunteer: false },
        linked: false,
      });
      expect(mine.foodGroup?.key).toBe((await row(p.id)).foodGroup);
      expect(await linkRow(u)).toBeUndefined();
    });

    it("saying they are coming opens the step, and the metadata says accepted with their flower", async () => {
      const h = await makeHackathon("rsvp-yes");
      const u = await makeUser("rsvp-yes");
      const p = await makeParticipant(h.id, u, { attendanceConfirmedAt: null });
      expect((await hackathonAs(u).myDiscord({ hackathonId: h.id })).eligible).toBe(false);

      await hackathonAs(u).confirmAttendance({ hackathonId: h.id });
      expect(await hackathonAs(u).myDiscord({ hackathonId: h.id })).toMatchObject({
        eligible: true,
        awaitingConfirmation: false,
        roles: { hacker: true, judge: false, volunteer: false },
      });

      const f = discordFetch({ meId: `d-rsvp-${suffix}` });
      expect(await link(u, h.id, f)).toMatchObject({ ok: true, home: "hackathon" });
      const number = svc.foodGroupByKey((await row(p.id)).foodGroup)!.number;
      expect(sent(f)).toEqual({
        accepted: 1,
        food_group: number,
        ramadan: 0,
        judge: 0,
        volunteer: 0,
      });
    });

    it("a hacker who is already checked in is through the door without the answer", async () => {
      const h = await makeHackathon("rsvp-door");
      const u = await makeUser("rsvp-door");
      await makeParticipant(h.id, u, {
        registrationStatus: "checked_in",
        attendanceConfirmedAt: null,
      });
      expect(await link(u, h.id, discordFetch({ meId: `d-door-${suffix}` }))).toMatchObject({
        ok: true,
      });
    });

    it("an approved judge with no registration can link and gets judge and no hacker values", async () => {
      const h = await makeHackathon("judge");
      const u = await makeUser("judge");
      await makeJudge(h.id, u);
      const f = discordFetch({ meId: `d-judge-${suffix}` });
      expect(await link(u, h.id, f, null, "invite")).toMatchObject({
        ok: true,
        then: "invite",
        home: "judge",
        username: "ada",
      });
      expect(sent(f)).toEqual({ accepted: 0, judge: 1, volunteer: 0 });

      const stored = await linkRow(u);
      expect(stored).toMatchObject({ discordUserId: `d-judge-${suffix}`, discordUsername: "ada" });
      expect(JSON.stringify(stored)).not.toContain("tok-user");
      const participants = await S.db!
        .select()
        .from(S.hackathonParticipants)
        .where(ops.eq(S.hackathonParticipants.userId, u));
      expect(participants).toHaveLength(0);

      expect(await hackathonAs(u).myDiscord({ hackathonId: h.id })).toMatchObject({
        eligible: true,
        roles: { hacker: false, judge: true, volunteer: false },
        linked: true,
        username: "ada",
        foodGroup: null,
        fasting: false,
      });
      // Updating roles again keeps the one row.
      expect(await link(u, h.id, discordFetch({ meId: `d-judge-${suffix}` }))).toMatchObject({ ok: true });
      const again = await S.db!
        .select()
        .from(S.discordLinks)
        .where(ops.eq(S.discordLinks.userId, u));
      expect(again).toHaveLength(1);

      await hackathonAs(u).unlinkDiscord({ hackathonId: h.id });
      expect(await linkRow(u)).toBeUndefined();
      expect((await hackathonAs(u).myDiscord({ hackathonId: h.id })).linked).toBe(false);
    });

    it("a judge who is not approved cannot link", async () => {
      const h = await makeHackathon("judge-no");
      const u = await makeUser("judge-no");
      await makeJudge(h.id, u, false);
      const f = discordFetch();
      expect(await link(u, h.id, f)).toEqual({ ok: false, reason: "not_accepted" });
      expect(f.calls).toHaveLength(0);
      expect(await hackathonAs(u).myDiscord({ hackathonId: h.id })).toMatchObject({
        eligible: false,
        roles: { judge: false },
      });
    });

    it("a volunteer links while an edition is open or live, with volunteer set", async () => {
      const h = await makeHackathon("vol");
      const u = await makeUser("vol");
      await makeVolunteer(u);
      const f = discordFetch({ meId: `d-vol-${suffix}` });
      expect(await link(u, h.id, f)).toMatchObject({ ok: true, home: "scan" });
      expect(sent(f)).toEqual({ accepted: 0, judge: 0, volunteer: 1 });
      expect(await hackathonAs(u).myDiscord({ hackathonId: h.id })).toMatchObject({
        eligible: true,
        roles: { hacker: false, judge: false, volunteer: true },
        linked: true,
      });
    });

    it("a volunteer has no step on an edition that is not open or live", async () => {
      const u = await makeUser("vol-status");
      await makeVolunteer(u);
      for (const status of ["draft", "announced", "completed", "cancelled"]) {
        const h = await makeHackathon(`vol-${status}`, { status });
        expect(await svc.resolveConnectTarget(S.db as any, u, h.id)).toBeNull();
      }
      for (const status of ["open", "closed", "in_progress"]) {
        const h = await makeHackathon(`vol-${status}`, { status });
        expect((await svc.resolveConnectTarget(S.db as any, u, h.id))?.roles.volunteer).toBe(true);
      }
    });

    it("an inactive or expired volunteer, and full staff, are not volunteers", async () => {
      const h = await makeHackathon("vol-no");
      const inactive = await makeUser("vol-inactive");
      await makeVolunteer(inactive, { isActive: false });
      const expired = await makeUser("vol-expired");
      await makeVolunteer(expired, { expiresAt: new Date(Date.now() - 60_000) });
      const staff = await makeUser("vol-staff");
      await S.db!.insert(S.admins).values({ userId: staff, role: "admin" });
      for (const u of [inactive, expired, staff]) {
        expect(await svc.resolveConnectTarget(S.db as any, u, h.id)).toBeNull();
      }
    });

    it("the default edition for a volunteer is the newest one that is open or live", async () => {
      const u = await makeUser("vol-default");
      await makeVolunteer(u);
      await makeHackathon("vd-old", {
        status: "completed",
        startDate: new Date("2026-02-01T00:00:00Z"),
        endDate: new Date("2026-02-03T00:00:00Z"),
      });
      const live = await makeHackathon("vd-live", {
        startDate: new Date("2033-02-01T00:00:00Z"),
        endDate: new Date("2033-02-03T00:00:00Z"),
      });
      await makeHackathon("vd-next", {
        status: "announced",
        startDate: new Date("2034-02-01T00:00:00Z"),
        endDate: new Date("2034-02-03T00:00:00Z"),
      });
      expect((await svc.resolveConnectTarget(S.db as any, u, null))?.hackathon.id).toBe(live.id);
      const mine = await hackathonAs(u).myDiscord({});
      expect(mine.hackathon?.id).toBe(live.id);
      expect(mine.roles.volunteer).toBe(true);
    });

    it("a judge who is also a confirmed hacker gets both, and both stores hold the link", async () => {
      const h = await makeHackathon("both");
      const u = await makeUser("both");
      const p = await makeParticipant(h.id, u);
      await makeJudge(h.id, u);
      const f = discordFetch({ meId: `d-both-${suffix}` });
      expect(await link(u, h.id, f, 1)).toMatchObject({ ok: true, home: "hackathon" });
      const number = svc.foodGroupByKey((await row(p.id)).foodGroup)!.number;
      expect(sent(f)).toEqual({
        accepted: 1,
        food_group: number,
        ramadan: 1,
        judge: 1,
        volunteer: 0,
      });
      expect(await row(p.id)).toMatchObject({ discordUserId: `d-both-${suffix}`, ramadanRoleOptIn: true });
      expect(await linkRow(u)).toMatchObject({ discordUserId: `d-both-${suffix}` });
    });

    it("a judge who is an accepted hacker not yet confirmed gets judge only, and the card asks for the answer", async () => {
      const h = await makeHackathon("judge-unconfirmed");
      const u = await makeUser("judge-unconfirmed");
      const p = await makeParticipant(h.id, u, { attendanceConfirmedAt: null });
      await makeJudge(h.id, u);
      const f = discordFetch({ meId: `d-ju-${suffix}` });
      expect(await link(u, h.id, f)).toMatchObject({ ok: true, home: "judge" });
      expect(sent(f)).toEqual({ accepted: 0, judge: 1, volunteer: 0 });
      // The registration is left alone: no flower role, no mirrored link.
      expect((await row(p.id)).discordUserId).toBeNull();
      expect(await hackathonAs(u).myDiscord({ hackathonId: h.id })).toMatchObject({
        eligible: true,
        awaitingConfirmation: true,
        linked: true,
      });
    });

    it("a judge and a volunteer at once get both", async () => {
      const h = await makeHackathon("jv");
      const u = await makeUser("jv");
      await makeJudge(h.id, u);
      await makeVolunteer(u);
      const f = discordFetch({ meId: `d-jv-${suffix}` });
      expect(await link(u, h.id, f)).toMatchObject({ ok: true });
      expect(sent(f)).toEqual({ accepted: 0, judge: 1, volunteer: 1 });
    });

    it("un-confirming or withdrawing leaves an existing link in place", async () => {
      const h = await makeHackathon("keeplink");
      const u = await makeUser("keeplink");
      const p = await makeParticipant(h.id, u);
      expect(await link(u, h.id, discordFetch({ meId: `d-keep2-${suffix}` }))).toMatchObject({ ok: true });

      await S.db!
        .update(S.hackathonParticipants)
        .set({ attendanceConfirmedAt: null })
        .where(ops.eq(S.hackathonParticipants.id, p.id));
      const after = await hackathonAs(u).myDiscord({ hackathonId: h.id });
      expect(after).toMatchObject({
        eligible: false,
        awaitingConfirmation: true,
        linked: true,
        username: "ada",
      });
      expect(await row(p.id)).toMatchObject({ discordUserId: `d-keep2-${suffix}` });

      await S.db!
        .delete(S.hackathonParticipants)
        .where(ops.eq(S.hackathonParticipants.id, p.id));
      expect(await linkRow(u)).toMatchObject({ discordUserId: `d-keep2-${suffix}` });
    });

    it("a hacker linked before the confirmation step keeps the link", async () => {
      const h = await makeHackathon("legacy");
      const u = await makeUser("legacy");
      await makeParticipant(h.id, u, {
        attendanceConfirmedAt: null,
        discordUserId: `d-legacy-${suffix}`,
        discordUsername: "old",
        discordLinkedAt: new Date(),
      });
      expect(await hackathonAs(u).myDiscord({ hackathonId: h.id })).toMatchObject({
        eligible: false,
        awaitingConfirmation: true,
        linked: true,
        username: "old",
      });
    });

    it("refuses a Discord account another person already holds, whichever store holds it", async () => {
      const h = await makeHackathon("held");
      const judgeA = await makeUser("held-a");
      const judgeB = await makeUser("held-b");
      await makeJudge(h.id, judgeA);
      await makeJudge(h.id, judgeB);
      const shared = `d-held-${suffix}`;
      expect(await link(judgeA, h.id, discordFetch({ meId: shared }))).toMatchObject({ ok: true });
      const f = discordFetch({ meId: shared });
      expect(await link(judgeB, h.id, f)).toMatchObject({ ok: false, reason: "already_linked" });
      expect(f.calls).toHaveLength(2);
      expect(await linkRow(judgeB)).toBeUndefined();

      // A hacker linked before this table existed holds the account on the
      // registration alone.
      const hackerAccount = `d-held-hacker-${suffix}`;
      const hacker = await makeUser("held-h");
      await makeParticipant(h.id, hacker, {
        discordUserId: hackerAccount,
        discordUsername: "old",
        discordLinkedAt: new Date(),
      });
      const judgeC = await makeUser("held-c");
      await makeJudge(h.id, judgeC);
      expect(await link(judgeC, h.id, discordFetch({ meId: hackerAccount }))).toMatchObject({
        ok: false,
        reason: "already_linked",
      });
      expect(await linkRow(judgeC)).toBeUndefined();
    });

    it("rolls back a first link, and restores a previous one, when Discord refuses the roles", async () => {
      const h = await makeHackathon("rollback");
      const u = await makeUser("rollback");
      await makeJudge(h.id, u);
      expect(await link(u, h.id, discordFetch({ meId: `d-rb1-${suffix}`, put: 500 }))).toMatchObject({
        ok: false,
        reason: "discord_error",
        home: "judge",
      });
      expect(await linkRow(u)).toBeUndefined();

      expect(await link(u, h.id, discordFetch({ meId: `d-rb1-${suffix}` }))).toMatchObject({ ok: true });
      expect(await link(u, h.id, discordFetch({ meId: `d-rb2-${suffix}`, put: 403 }))).toMatchObject({
        ok: false,
        reason: "discord_denied",
      });
      expect(await linkRow(u)).toMatchObject({ discordUserId: `d-rb1-${suffix}` });
    });

    it("the signed state stays bound to the user it was made for", () => {
      const secret = "s".repeat(40);
      const token = svc.signState({ u: "judge-1", h: "hack-1", r: null, t: "portal" }, secret);
      expect(svc.verifyState(token, secret, { userId: "judge-1" })).toMatchObject({ u: "judge-1" });
      expect(svc.verifyState(token, secret, { userId: "judge-2" })).toBeNull();
    });
  });

  it("maps Discord errors and leaves nothing linked", async () => {
    const h = await makeHackathon("errors");
    const u = await makeUser("errors");
    const p = await makeParticipant(h.id, u);

    expect(await link(u, h.id, discordFetch({ token: 400 }))).toMatchObject({
      ok: false,
      reason: "bad_code",
    });
    expect(await link(u, h.id, discordFetch({ token: 429 }))).toMatchObject({
      ok: false,
      reason: "rate_limited",
      retryAfter: 5,
    });
    expect(await link(u, h.id, discordFetch({ me: 403 }))).toMatchObject({
      reason: "discord_denied",
    });
    expect(await link(u, h.id, discordFetch({ put: 403 }))).toMatchObject({
      reason: "discord_denied",
    });
    expect(await link(u, h.id, discordFetch({ put: 429 }))).toMatchObject({
      reason: "rate_limited",
      retryAfter: 2,
    });
    expect(await link(u, h.id, discordFetch({ put: 500 }))).toMatchObject({
      reason: "discord_error",
    });
    expect((await row(p.id)).discordUserId).toBeNull();
  });

  it("links one Discord account to one participant per hackathon", async () => {
    const h = await makeHackathon("unique");
    const a = await makeUser("uniq-a");
    const b = await makeUser("uniq-b");
    await makeParticipant(h.id, a);
    const pb = await makeParticipant(h.id, b);
    const shared = `d-shared-${suffix}`;
    expect(await link(a, h.id, discordFetch({ meId: shared }))).toMatchObject({ ok: true });
    expect(await link(b, h.id, discordFetch({ meId: shared }))).toMatchObject({
      ok: false,
      reason: "already_linked",
    });
    expect((await row(pb.id)).discordUserId).toBeNull();
  });

  it("defaults the verification URL to the live edition the user is accepted to", async () => {
    const u = await makeUser("verify");
    const old = await makeHackathon("v-old", {
      status: "completed",
      startDate: new Date("2026-02-01T00:00:00Z"),
      endDate: new Date("2026-02-03T00:00:00Z"),
    });
    const current = await makeHackathon("v-now");
    const pending = await makeHackathon("v-pending", {
      startDate: new Date("2028-02-01T00:00:00Z"),
      endDate: new Date("2028-02-03T00:00:00Z"),
    });
    await makeParticipant(old.id, u);
    await makeParticipant(current.id, u);
    await makeParticipant(pending.id, u, { registrationStatus: "pending" });
    const target = await svc.resolveConnectTarget(S.db as any, u, null);
    expect(target?.hackathon.id).toBe(current.id);
    expect(await svc.resolveConnectTarget(S.db as any, u, pending.id)).toBeNull();
  });

  it("myDiscord shows the food group lazily, hides it from the unaccepted, and unlink clears the link", async () => {
    const h = await makeHackathon("my");
    const u = await makeUser("my");
    const p = await makeParticipant(h.id, u);
    const stranger = await makeUser("my-stranger");

    const before = await hackathonAs(u).myDiscord({ hackathonId: h.id });
    expect(before.eligible).toBe(true);
    expect(before.foodGroup?.name).toBeTruthy();
    expect(before.fasting).toBe(true);
    expect((await row(p.id)).foodGroup).toBe(before.foodGroup?.key);
    expect(await hackathonAs(stranger).myDiscord({ hackathonId: h.id })).toMatchObject({
      eligible: false,
      awaitingConfirmation: false,
      foodGroup: null,
      linked: false,
    });

    await link(u, h.id, discordFetch({ meId: `d-my-${suffix}` }), 1);
    const linked = await hackathonAs(u).myDiscord({ hackathonId: h.id });
    expect(linked).toMatchObject({ linked: true, username: "ada", ramadanOptIn: true });

    await hackathonAs(u).unlinkDiscord({ hackathonId: h.id });
    const after = await row(p.id);
    expect(after).toMatchObject({
      discordUserId: null,
      discordUsername: null,
      discordLinkedAt: null,
    });
    expect(after.foodGroup).toBe(before.foodGroup?.key);
  });

  describe("flowers are assigned when someone is accepted", () => {
    const makeAdmin = async (tag: string) => {
      const id = await makeUser(tag);
      await S.db!.insert(S.admins).values({ userId: id, role: "admin" });
      return hackathonAs(id);
    };
    const flowerOf = async (id: string) => (await row(id)).foodGroup;
    /** Members per flower across these participants; fails on a missing flower. */
    const sizesOf = async (ids: string[]) => {
      const counts = new Map<string, number>();
      for (const id of ids) {
        const g = await flowerOf(id);
        expect(svc.FOOD_GROUP_KEYS).toContain(g);
        counts.set(g!, (counts.get(g!) ?? 0) + 1);
      }
      return svc.FOOD_GROUPS.map((g) => counts.get(g.key) ?? 0);
    };
    const spread = (sizes: number[]) => Math.max(...sizes) - Math.min(...sizes);
    const pendingIn = async (hackathonId: string, n: number, tag: string) => {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const p = await makeParticipant(hackathonId, await makeUser(`${tag}${i}`), {
          registrationStatus: "pending",
        });
        ids.push(p.id);
      }
      return ids;
    };

    it("accepting one participant gives them a flower", async () => {
      const h = await makeHackathon("auto-one");
      const admin = await makeAdmin("ao-admin");
      const [id] = await pendingIn(h.id, 1, "ao");
      expect(await flowerOf(id!)).toBeNull();

      await admin.updateParticipantStatus({
        hackathonId: h.id,
        participantId: id!,
        status: "approved",
      });
      expect(svc.FOOD_GROUP_KEYS).toContain(await flowerOf(id!));
    });

    it("a wave and a bulk status change give everyone a flower, evenly", async () => {
      const h = await makeHackathon("auto-bulk");
      const admin = await makeAdmin("ab-admin");
      const ids = await pendingIn(h.id, 21, "ab");

      const wave = await admin.acceptWave({ hackathonId: h.id, size: 13 });
      expect(wave.accepted).toBe(13);
      const waved = wave.participantIds as string[];
      expect(spread(await sizesOf(waved))).toBeLessThanOrEqual(1);
      const left = ids.filter((id) => !waved.includes(id));
      for (const id of left) expect(await flowerOf(id)).toBeNull();

      await admin.batchUpdateParticipantStatus({
        hackathonId: h.id,
        participantIds: left,
        status: "approved",
      });
      const sizes = await sizesOf(ids);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(21);
      expect(spread(sizes)).toBeLessThanOrEqual(1);
    });

    it("mass acceptance with email gives everyone a flower, evenly", async () => {
      const h = await makeHackathon("auto-mass");
      const admin = await makeAdmin("am-admin");
      const ids = await pendingIn(h.id, 19, "am");

      const out = await admin.sendMassAcceptanceEmails({
        hackathonId: h.id,
        participantIds: ids,
      });
      expect(out.approved).toBe(19);
      expect(spread(await sizesOf(ids))).toBeLessThanOrEqual(1);
    });

    it("a first check-in gives a flower to anyone who still has none", async () => {
      const h = await makeHackathon("auto-checkin");
      const admin = await makeAdmin("ac-admin");
      const [ev] = await S.db!
        .insert(S.hackathonEvents)
        .values({
          hackathonId: h.id,
          name: "Opening",
          type: "activity",
          location: "Atrium",
          startTime: new Date(Date.now() - 60 * 60_000),
          endTime: new Date(Date.now() + 2 * 60 * 60_000),
        })
        .returning();
      // Accepted before flowers were automatic: no flower yet.
      const arriving = await makeParticipant(h.id, await makeUser("ac-in"));
      const bystander = await makeParticipant(h.id, await makeUser("ac-by"));
      expect(await flowerOf(arriving.id)).toBeNull();

      const res = await admin.admit({
        hackathonId: h.id,
        eventId: ev!.id,
        participantId: arriving.id,
      });
      expect(res.checkedIn).toBe(true);
      expect((await row(arriving.id)).registrationStatus).toBe("checked_in");
      expect(svc.FOOD_GROUP_KEYS).toContain(await flowerOf(arriving.id));
      expect(svc.FOOD_GROUP_KEYS).toContain(await flowerOf(bystander.id));
    });

    it("checking in someone already accepted gives them a flower", async () => {
      const h = await makeHackathon("auto-status-checkin");
      const admin = await makeAdmin("asc-admin");
      const p = await makeParticipant(h.id, await makeUser("asc"));
      await admin.updateParticipantStatus({
        hackathonId: h.id,
        participantId: p.id,
        status: "checked_in",
      });
      expect(svc.FOOD_GROUP_KEYS).toContain(await flowerOf(p.id));
    });

    it("accepting anyone backfills those accepted earlier without a flower", async () => {
      const h = await makeHackathon("auto-backfill");
      const admin = await makeAdmin("abf-admin");
      const earlier: string[] = [];
      for (let i = 0; i < 11; i++) {
        const status = i % 3 === 0 ? "checked_in" : "approved";
        const p = await makeParticipant(h.id, await makeUser(`abf${i}`), {
          registrationStatus: status,
        });
        earlier.push(p.id);
      }
      const [newcomer] = await pendingIn(h.id, 1, "abf-new");

      await admin.updateParticipantStatus({
        hackathonId: h.id,
        participantId: newcomer!,
        status: "approved",
      });
      const sizes = await sizesOf([...earlier, newcomer!]);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(12);
      expect(spread(sizes)).toBeLessThanOrEqual(1);
    });

    it("pending, waitlisted and rejected people never get a flower", async () => {
      const h = await makeHackathon("auto-never");
      const admin = await makeAdmin("an-admin");
      const pending = await makeParticipant(h.id, await makeUser("an-p"), {
        registrationStatus: "pending",
      });
      const waitlisted = await makeParticipant(h.id, await makeUser("an-w"), {
        registrationStatus: "waitlisted",
      });
      const rejected = await makeParticipant(h.id, await makeUser("an-r"), {
        registrationStatus: "rejected",
      });
      const accepted = await pendingIn(h.id, 3, "an-a");
      const [mover] = await pendingIn(h.id, 1, "an-m");

      await admin.batchUpdateParticipantStatus({
        hackathonId: h.id,
        participantIds: accepted,
        status: "approved",
      });
      // Moving somebody to a status that is not accepted assigns nothing either.
      await admin.updateParticipantStatus({
        hackathonId: h.id,
        participantId: mover!,
        status: "waitlisted",
      });

      for (const id of [pending.id, waitlisted.id, rejected.id, mover!]) {
        expect(await flowerOf(id)).toBeNull();
      }
      for (const id of accepted) expect(svc.FOOD_GROUP_KEYS).toContain(await flowerOf(id));
    });

    it("never changes a flower someone already has", async () => {
      const h = await makeHackathon("auto-keep");
      const admin = await makeAdmin("ak-admin");
      // Piled onto one flower, far from balanced: a rebalance would move them.
      const held: string[] = [];
      for (let i = 0; i < 6; i++) {
        const p = await makeParticipant(h.id, await makeUser(`ak${i}`), {
          foodGroup: "rose",
        });
        held.push(p.id);
      }
      const others = await pendingIn(h.id, 16, "ak-o");

      await admin.batchUpdateParticipantStatus({
        hackathonId: h.id,
        participantIds: others,
        status: "approved",
      });
      for (const id of held) expect(await flowerOf(id)).toBe("rose");
      // Every newcomer has a flower, and they fill the other flowers first.
      const sizes = await sizesOf(others);
      expect(sizes[svc.FOOD_GROUP_KEYS.indexOf("rose")]).toBe(0);
    });
  });

  it("roster and export carry the Discord columns, and bug testers are refused", async () => {
    const h = await makeHackathon("roster");
    const admin = await makeUser("ro-admin");
    await S.db!.insert(S.admins).values({ userId: admin, role: "admin" });
    const tester = await makeUser("ro-tester");
    await S.db!.insert(S.admins).values({ userId: tester, role: "bug_tester" });
    const u = await makeUser("ro");
    await makeParticipant(h.id, u);
    await link(u, h.id, discordFetch({ meId: `d-ro-${suffix}` }), 1);

    const caller = hackathonAs(admin);
    const list = await caller.adminGetAttendees({ hackathonId: h.id });
    expect(list.attendees[0]).toMatchObject({
      discordUsername: "ada",
      ramadanRoleOptIn: true,
    });
    expect(list.attendees[0].foodGroup).toBeTruthy();
    const exported = await caller.exportAttendees({ hackathonId: h.id });
    expect(exported[0]).toMatchObject({ discordUsername: "ada", ramadanRoleOptIn: true });
    expect(exported[0].foodGroup).toBeTruthy();

    const bug = hackathonAs(tester);
    await expect(bug.adminGetAttendees({ hackathonId: h.id })).rejects.toThrow();
    await expect(bug.exportAttendees({ hackathonId: h.id })).rejects.toThrow();
  });
});
