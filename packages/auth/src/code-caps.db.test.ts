import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DbModule from "@query/db";
import type * as Throttle from "@query/db/services/auth-throttle";
import type * as DrizzleOps from "drizzle-orm";
import { NextRequest } from "next/server";
import type { handlers as Handlers } from "./auth";
import type { runCodeRequest as RunCodeRequest } from "./sign-in-attempt";

/**
 * Real-Postgres tests for the email that sign-in sends, with only the mail
 * stubbed. They share one file because they spend the same deployment-wide
 * counter, which two test files running side by side would corrupt for each
 * other. First, who can spend the sign-in code budget.
 *
 * One client must not be able to use up what every other sign-in needs, so a
 * network, a domain and the whole deployment each have an hourly cap in the
 * database, and a request any of them refuses says so instead of looking sent.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. It uses its own addresses and removes its
 * rows afterwards, and puts the deployment-wide counter back as it found it.
 */
const URL = process.env.TEST_DATABASE_URL;

const mail = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; text: string; html: string }[],
}));
vi.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async (message: {
      to: string;
      subject: string;
      text: string;
      html: string;
    }) => {
      mail.sent.push(message);
      return { rejected: [], pending: [] };
    },
  }),
}));

const ORIGIN = "http://localhost:3000";

type Send = (params: unknown) => Promise<void>;

// The caps as an organizer would state them, not read back from the code.
const NETWORK_CAP = 40;
const DOMAIN_CAP = 20;
const LARGE_DOMAIN_CAP = 120;
// Of the deployment's 300 an hour, new addresses may use this many.
const NEW_ADDRESS_CAP = 200;

describe.skipIf(!URL)("email code caps on a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  let S: typeof DbModule;
  let throttle: typeof Throttle;
  let send: Send;
  let runCodeRequest: typeof RunCodeRequest;
  let globalBefore: { issued: number; start: Date } | null = null;

  const db = () => {
    const database = S.db;
    if (!database) throw new Error("TEST_DATABASE_URL did not give a database");
    return database;
  };
  /** The raw driver result's rows, which drizzle's execute type does not name. */
  const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;

  /** Documentation and shared-address ranges: nothing real lives there. */
  const OWN_KEYS = [
    "ip:203.0.113.0/24",
    "ip:198.51.100.0/24",
    "ip:192.0.2.0/24",
    "ip-known:192.0.2.0/24",
    "domain:gatech.edu",
    "*global-new*",
  ];

  const clean = async () => {
    const { sql } = await import("drizzle-orm");
    await db().execute(
      sql`DELETE FROM "user" WHERE "email" LIKE ${`%${suffix}%`}`,
    );
    await db().execute(
      sql`DELETE FROM "auth_code_throttle"
          WHERE "identifier" LIKE 'ip:100.64.%' OR "identifier" LIKE 'ip-known:198.18.%'
             OR "identifier" LIKE ${`%${suffix}%`}
             OR "identifier" IN (${sql.join(OWN_KEYS.map((key) => sql`${key}`), sql`, `)})`,
    );
    await db().execute(
      sql`DELETE FROM "verificationToken" WHERE "identifier" LIKE ${`%${suffix}%`}`,
    );
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    throttle = await import("@query/db/services/auth-throttle");
    ({ runCodeRequest } = await import("./sign-in-attempt"));
    const { authConfig } = await import("./config");
    const provider = (
      authConfig.providers as {
        id: string;
        options?: { sendVerificationRequest?: Send };
        sendVerificationRequest?: Send;
      }[]
    ).find((p) => p.id === "nodemailer");
    const fn =
      provider?.options?.sendVerificationRequest ??
      provider?.sendVerificationRequest;
    if (!fn) throw new Error("nodemailer provider not found");
    send = (params) =>
      fn({ ...(params as object), provider: { server: {}, from: "n@x.test" } });

    const { sql } = await import("drizzle-orm");
    const row = await db().execute(
      sql`SELECT "codes_issued", "issue_window_start" FROM "auth_code_throttle" WHERE "identifier" = ${throttle.GLOBAL_THROTTLE_KEY}`,
    );
    const found = rowsOf<{ codes_issued: number; issue_window_start: Date }>(
      row,
    )[0];
    globalBefore = found
      ? { issued: found.codes_issued, start: found.issue_window_start }
      : null;
    await clean();
    await db().execute(
      sql`DELETE FROM "auth_code_throttle" WHERE "identifier" = ${throttle.GLOBAL_THROTTLE_KEY}`,
    );
  }, 60_000);

  afterAll(async () => {
    if (!S) return;
    const { sql } = await import("drizzle-orm");
    await clean();
    await db().execute(
      sql`DELETE FROM "auth_code_throttle" WHERE "identifier" = ${throttle.GLOBAL_THROTTLE_KEY}`,
    );
    if (globalBefore) {
      await db().execute(
        sql`INSERT INTO "auth_code_throttle" ("identifier", "codes_issued", "issue_window_start") VALUES (${throttle.GLOBAL_THROTTLE_KEY}, ${globalBefore.issued}, ${globalBefore.start})`,
      );
    }
  }, 60_000);

  /** Every test starts with the deployment's budget unspent. */
  beforeEach(async () => {
    const { sql } = await import("drizzle-orm");
    await db().execute(
      sql`DELETE FROM "auth_code_throttle" WHERE "identifier" IN (${throttle.GLOBAL_THROTTLE_KEY}, ${"*global-new*"})`,
    );
  });

  /** An address with an account, as a person who has signed in before has. */
  const withAccount = async (local: string, domain: string) => {
    const email = `${local}-${suffix}@${domain}`;
    await db().insert(S.users).values({ id: `caps-${suffix}-${local}`, email });
    return email;
  };

  /** One code request: from where, for whom. */
  const request = async (clientIp: string, email: string) => {
    const before = mail.sent.length;
    const { busy } = await runCodeRequest(clientIp, () =>
      send({ identifier: email }),
    );
    return { busy, sent: mail.sent.length > before };
  };
  const globalIssued = async () => {
    const { sql } = await import("drizzle-orm");
    const res = await db().execute(
      sql`SELECT "codes_issued" FROM "auth_code_throttle" WHERE "identifier" = ${throttle.GLOBAL_THROTTLE_KEY}`,
    );
    return rowsOf<{ codes_issued: number }>(res)[0]?.codes_issued ?? 0;
  };

  it("stops one network at its hourly cap and says so, while another network still gets a code", async () => {
    for (let i = 0; i < NETWORK_CAP; i += 1) {
      // A host in the same /24 each time, and a domain of its own each time.
      const result = await request(
        `203.0.113.${i + 1}`,
        `u${i}@net${i}-${suffix}.test`,
      );
      expect(result).toEqual({ busy: false, sent: true });
    }
    const spent = await globalIssued();
    expect(spent).toBe(NETWORK_CAP);

    expect(
      await request("203.0.113.200", `late@net-late-${suffix}.test`),
    ).toEqual({ busy: true, sent: false });
    // Refused before it took anything else: the deployment's slots are intact.
    expect(await globalIssued()).toBe(spent);

    expect(
      await request("198.51.100.5", `other@net-other-${suffix}.test`),
    ).toEqual({ busy: false, sent: true });
  }, 60_000);

  it("stops one domain at its cap, whichever networks the requests come from", async () => {
    const domain = `catchall-${suffix}.test`;
    for (let i = 0; i < DOMAIN_CAP; i += 1) {
      expect(await request(`100.64.${i}.1`, `bot${i}@${domain}`)).toEqual({
        busy: false,
        sent: true,
      });
    }
    expect(await request("100.64.200.1", `bot-late@${domain}`)).toEqual({
      busy: true,
      sent: false,
    });
    // Someone on another domain, from yet another network, is not affected.
    expect(await request("100.64.201.1", `real@other-${suffix}.test`)).toEqual({
      busy: false,
      sent: true,
    });
  }, 60_000);

  it("lets a big school's domain take many more codes in an hour", async () => {
    for (let i = 0; i < LARGE_DOMAIN_CAP; i += 1) {
      const ip = `100.64.${i + 50}.1`;
      expect((await request(ip, `s${suffix}${i}@gatech.edu`)).busy).toBe(false);
    }
    expect(
      (await request("100.64.250.1", `s${suffix}x@gatech.edu`)).busy,
    ).toBe(true);
  }, 90_000);

  it("says so when the deployment-wide cap is spent too", async () => {
    const { sql } = await import("drizzle-orm");
    await db().execute(
      sql`INSERT INTO "auth_code_throttle" ("identifier", "issue_window_start", "codes_issued") VALUES (${throttle.GLOBAL_THROTTLE_KEY}, now(), ${throttle.GLOBAL_CODES_PER_HOUR}) ON CONFLICT ("identifier") DO UPDATE SET "issue_window_start" = now(), "codes_issued" = ${throttle.GLOBAL_CODES_PER_HOUR}`,
    );
    expect(await request("198.51.100.77", `late@global-${suffix}.test`)).toEqual({
      busy: true,
      sent: false,
    });
    // The shared mailbox has one quota, so people with an account wait too.
    const real = await withAccount("spent", `school-${suffix}.test`);
    expect(await request("198.51.100.78", real)).toEqual({ busy: true, sent: false });
  });

  it("does not call a code sent when the same address asks again within the minute", async () => {
    const { sql } = await import("drizzle-orm");
    await db().execute(
      sql`UPDATE "auth_code_throttle" SET "codes_issued" = 0, "issue_window_start" = now() WHERE "identifier" = ${throttle.GLOBAL_THROTTLE_KEY}`,
    );
    const email = `twice@repeat-${suffix}.test`;
    expect(await request("198.51.100.30", email)).toEqual({
      busy: false,
      sent: true,
    });
    // The first code is still in the inbox: nothing new goes out, and nothing
    // is wrong, so the screen may keep saying a code was sent.
    expect(await request("198.51.100.30", email)).toEqual({
      busy: false,
      sent: false,
    });
  });

  it("does not make people who already have an account wait when fake addresses fill their domain", async () => {
    const domain = `big-${suffix}.edu`;
    const real = await withAccount("real", domain);
    for (let i = 0; i < LARGE_DOMAIN_CAP; i += 1) {
      expect(
        (await request(`100.66.${i}.1`, `fake${i}-${suffix}@${domain}`)).busy,
      ).toBe(false);
    }
    // Someone new on that domain is held back...
    expect(await request("100.66.200.1", `new-${suffix}@${domain}`)).toEqual({
      busy: true,
      sent: false,
    });
    // ...someone with an account is not, and nor is the next person with one.
    expect(await request("100.66.201.1", real)).toEqual({ busy: false, sent: true });
  }, 90_000);

  it("lets everyone with an account sign in from one shared network, and still holds new addresses to its cap", async () => {
    // The venue's wifi on judging day: one address for everyone, nearly all of
    // whom applied and so have an account.
    const { sql } = await import("drizzle-orm");
    await db().execute(
      sql`DELETE FROM "auth_code_throttle" WHERE "identifier" = 'ip:192.0.2.0/24'`,
    );
    for (let i = 0; i < 50; i += 1) {
      const real = await withAccount(`venue${i}`, `school-${suffix}.test`);
      expect(await request(`192.0.2.${i + 1}`, real)).toEqual({
        busy: false,
        sent: true,
      });
    }

    // They did not use the network's hour: strangers on it get all 40.
    for (let i = 0; i < NETWORK_CAP; i += 1) {
      const result = await request(`192.0.2.${i + 100}`, `new${i}@stranger${i}-${suffix}.test`);
      expect(result).toEqual({ busy: false, sent: true });
    }
    // The 41st unknown address on that /24 is refused.
    expect(await request("192.0.2.250", `late@stranger-late-${suffix}.test`)).toEqual({
      busy: true,
      sent: false,
    });
    // And one more person with an account still gets in.
    const another = await withAccount("venue-last", `school-${suffix}.test`);
    expect(await request("192.0.2.251", another)).toEqual({ busy: false, sent: true });
  }, 60_000);

  it("caps the accounts one network can ask for, so it cannot take the whole deployment's hour", async () => {
    // Accounts cost an attacker one code each, so a catch-all domain makes them
    // cheap. Held to a bucket of their own, one network cannot take all 300.
    const KNOWN_CAP = 150;
    const people = Array.from({ length: KNOWN_CAP + 2 }, (_, i) => ({
      id: `caps-${suffix}-known${i}`,
      email: `known${i}-${suffix}@catchall-${suffix}.test`,
    }));
    await db().insert(S.users).values(people);
    const emailOf = (i: number) => people[i]?.email ?? "";

    for (let i = 0; i < KNOWN_CAP; i += 1) {
      const result = await request(`198.18.0.${(i % 250) + 1}`, emailOf(i));
      expect(result).toEqual({ busy: false, sent: true });
    }
    // The 151st from that /24 is refused...
    expect(await request("198.18.0.251", emailOf(KNOWN_CAP))).toEqual({
      busy: true,
      sent: false,
    });
    // ...and the rest of the deployment's hour is still there for another network.
    expect(await request("198.18.1.1", emailOf(KNOWN_CAP + 1))).toEqual({
      busy: false,
      sent: true,
    });
    expect(await globalIssued()).toBe(KNOWN_CAP + 1);
  }, 120_000);

  it("keeps part of the deployment's hour for people who already have an account", async () => {
    const real = await withAccount("headroom", `school-${suffix}.test`);
    for (let i = 0; i < NEW_ADDRESS_CAP; i += 1) {
      const result = await request(`100.67.${i}.1`, `n${i}@fresh${i}-${suffix}.test`);
      expect(result.busy).toBe(false);
    }

    // New addresses have used what they may of the hour.
    expect(await request("100.67.250.1", `late@fresh-late-${suffix}.test`)).toEqual({
      busy: true,
      sent: false,
    });
    // The rest is for people who have signed in before.
    expect(await request("100.67.251.1", real)).toEqual({ busy: false, sent: true });
    expect(await globalIssued()).toBe(NEW_ADDRESS_CAP + 1);
  }, 120_000);

  it("spends nothing from either budget on a new address a cap refused", async () => {
    const domain = `refused-${suffix}.test`;
    for (let i = 0; i < DOMAIN_CAP; i += 1) {
      await request(`100.68.${i}.1`, `x${i}@${domain}`);
    }
    const spent = await globalIssued();

    expect(await request("100.68.200.1", `over@${domain}`)).toEqual({
      busy: true,
      sent: false,
    });

    expect(await globalIssued()).toBe(spent);
  }, 60_000);
});

/**
 * Getting in while an address is locked out of codes.
 *
 * Anyone can ask for a code for any address and then guess at it, so enough
 * wrong guesses lock the address out of code sign-in. A stranger could keep the
 * owner out by doing it again at each unlock, so the owner needs a way in the
 * guesses cannot reach: while locked, the sign-in email carries Auth.js's own
 * link, which holds a token nobody can guess, in place of a code.
 *
 * This drives Auth.js itself, from the sign-in request to the link being opened.
 */
describe.skipIf(!URL)("signing in by link while locked out of codes", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let throttle: typeof Throttle;
  let handlers: typeof Handlers;
  const previous = {
    secret: process.env.AUTH_SECRET,
    url: process.env.AUTH_URL,
  };

  const database = () => {
    const found = S.db;
    if (!found) throw new Error("TEST_DATABASE_URL did not give a database");
    return found;
  };
  const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.AUTH_SECRET = "magic-link-test-secret-0123456789abcdef";
    process.env.AUTH_URL = ORIGIN;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    throttle = await import("@query/db/services/auth-throttle");
    ({ handlers } = await import("./auth"));
  }, 60_000);

  const clean = async () => {
    await database().execute(
      ops.sql`DELETE FROM "user" WHERE "email" LIKE ${`%${suffix}%`}`,
    );
    await database().execute(
      ops.sql`DELETE FROM "verificationToken" WHERE "identifier" LIKE ${`%${suffix}%`}`,
    );
    await database().execute(
      ops.sql`DELETE FROM "auth_code_throttle" WHERE "identifier" LIKE ${`%${suffix}%`} OR "identifier" IN ('domain:example.test', '*global*', '*global-new*')`,
    );
  };
  beforeEach(async () => {
    mail.sent.length = 0;
    await clean();
  });
  afterAll(async () => {
    if (!S?.db) return;
    await clean();
    if (previous.secret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous.secret;
    if (previous.url === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = previous.url;
  }, 60_000);

  /** A person with an account, and an address wrong guesses have locked. */
  async function lockedOwner(name: string) {
    const email = `${name}-${suffix}@example.test`;
    await database().insert(S.users).values({
      id: `ml-${suffix}-${name}`,
      email,
      emailVerified: new Date(),
    });
    for (let i = 0; i < 20; i += 1) {
      await throttle.recordFailure(database(), email);
    }
    expect(await throttle.isLockedOut(database(), email)).toBe(true);
    return email;
  }

  /** The cookie jar a browser would carry from asking Auth.js for a sign-in. */
  async function csrf() {
    const res = await handlers.GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
    const { csrfToken } = (await res.json()) as { csrfToken: string };
    const cookie = (res.headers.getSetCookie?.() ?? [])
      .map((line) => line.split(";")[0])
      .join("; ");
    return { csrfToken, cookie };
  }

  /** Asks to sign in by email, as /login does. */
  async function requestEmail(email: string) {
    const { csrfToken, cookie } = await csrf();
    const res = await handlers.POST(
      new NextRequest(`${ORIGIN}/api/auth/signin/nodemailer`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-auth-return-redirect": "1",
          cookie,
        },
        body: new URLSearchParams({
          csrfToken,
          email,
          callbackUrl: `${ORIGIN}/dashboard`,
        }),
      }),
    );
    return { res, cookie };
  }

  const linkIn = (text: string) =>
    /https?:\/\/\S+\/api\/auth\/callback\/nodemailer\S*/.exec(text)?.[0];

  const customRows = async (email: string) =>
    rowsOf<{ token: string }>(
      await database().execute(
        ops.sql`SELECT "token" FROM "verificationToken" WHERE "identifier" = ${email} AND "token" LIKE 'custom:%'`,
      ),
    );
  const sessionsOf = async (email: string) =>
    rowsOf<{ sessionToken: string }>(
      await database().execute(
        ops.sql`SELECT s."sessionToken" FROM "session" s JOIN "user" u ON u.id = s."userId" WHERE lower(u."email") = ${email}`,
      ),
    );

  it("emails a sign-in link, and no code, to an address locked out of codes", async () => {
    const email = await lockedOwner("victim");

    await requestEmail(email);

    expect(mail.sent).toHaveLength(1);
    const [message] = mail.sent;
    expect(message?.to).toBe(email);
    expect(linkIn(message?.text ?? "")).toBeTruthy();
    expect(message?.text).toMatch(/Use this link to sign in/);
    expect(message?.text).toMatch(/Codes for this address are paused/);
    // Nothing for a guesser to aim at.
    expect(message?.text).not.toMatch(/\b\d{6}\b/);
    expect(message?.subject).not.toMatch(/\b\d{6}\b/);
    expect(await customRows(email)).toEqual([]);
  });

  it("lets the owner in through that link, which clears the lock", async () => {
    const email = await lockedOwner("owner");
    const { cookie } = await requestEmail(email);
    const link = linkIn(mail.sent[0]?.text ?? "");
    if (!link) throw new Error("no link in the email");

    const res = await handlers.GET(
      new NextRequest(link, { headers: { cookie } }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(res.headers.getSetCookie().join("\n")).toMatch(
      /authjs\.session-token=/,
    );
    expect(await sessionsOf(email)).toHaveLength(1);
    expect(await throttle.isLockedOut(database(), email)).toBe(false);
    const row = rowsOf<{ failures: number; lockouts: number }>(
      await database().execute(
        ops.sql`SELECT "failures", "lockouts" FROM "auth_code_throttle" WHERE "identifier" = ${email}`,
      ),
    )[0];
    expect(row).toMatchObject({ failures: 0, lockouts: 0 });
  });

  it("works once", async () => {
    const email = await lockedOwner("once");
    const { cookie } = await requestEmail(email);
    const link = linkIn(mail.sent[0]?.text ?? "");
    if (!link) throw new Error("no link in the email");
    await handlers.GET(new NextRequest(link, { headers: { cookie } }));

    const again = await handlers.GET(
      new NextRequest(link, { headers: { cookie } }),
    );

    expect(again.headers.get("location")).toContain("error=Verification");
    expect(await sessionsOf(email)).toHaveLength(1);
  });

  it("makes no code for a locked address, so there is nothing to guess at", async () => {
    const email = await lockedOwner("guessed");
    await requestEmail(email);

    // The route that takes codes is shut until the lock ends.
    expect(await throttle.isLockedOut(database(), email)).toBe(true);
    expect(await customRows(email)).toEqual([]);
  });

  it("still emails a code, not a link, to an address that is not locked", async () => {
    const email = `fine-${suffix}@example.test`;

    await requestEmail(email);

    const [message] = mail.sent;
    expect(message?.text).toMatch(/Your sign-in code is: \d{6}/);
    expect(linkIn(message?.text ?? "")).toBeUndefined();
    expect(await customRows(email)).toHaveLength(1);
  });

  it("counts a link email against the same hourly caps as a code", async () => {
    const email = await lockedOwner("capped");
    for (let i = 0; i < 6; i += 1) await requestEmail(email);

    // Five an hour per address, then nothing more goes out.
    expect(mail.sent).toHaveLength(5);
  });
});
