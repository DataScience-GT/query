import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as DbModule from "@query/db";
import type * as Throttle from "@query/db/services/auth-throttle";
import type { runCodeRequest as RunCodeRequest } from "./sign-in-attempt";

/**
 * Real-Postgres test for who can spend the sign-in code budget. The request
 * that sends a code runs against a real database with only the mail stubbed.
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

const mail = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async (message: { to: string }) => {
      mail.sent.push(message.to);
      return { rejected: [], pending: [] };
    },
  }),
}));

type Send = (params: unknown) => Promise<void>;

// The caps as an organizer would state them, not read back from the code.
const NETWORK_CAP = 40;
const DOMAIN_CAP = 20;
const LARGE_DOMAIN_CAP = 120;

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
    "domain:gatech.edu",
  ];

  const clean = async () => {
    const { sql } = await import("drizzle-orm");
    await db().execute(
      sql`DELETE FROM "auth_code_throttle"
          WHERE "identifier" LIKE 'ip:100.64.%' OR "identifier" LIKE ${`%${suffix}%`}
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
      sql`UPDATE "auth_code_throttle" SET "codes_issued" = ${throttle.GLOBAL_CODES_PER_HOUR}, "issue_window_start" = now() WHERE "identifier" = ${throttle.GLOBAL_THROTTLE_KEY}`,
    );
    expect(await request("198.51.100.77", `late@global-${suffix}.test`)).toEqual({
      busy: true,
      sent: false,
    });
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
});
