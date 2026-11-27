import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { discordConfig, FOOD_GROUPS, foodGroupByKey } from "./config";
import { autoAssignFoodGroups, pickFoodGroup } from "./food-group";
import {
  hasDiscordRole,
  isConfirmedHacker,
  NO_ROLES,
  ramadanFlag,
  roleMetadata,
  roleSignature,
  rolesFor,
  ZERO_METADATA,
} from "./roles";
import { openToken, sealToken } from "./token-crypto";
import { signState, verifyState, STATE_TTL_MS } from "./state";

const SECRET = "x".repeat(40);
const base = { u: "user-1", h: "hack-1", r: 1 as const, t: "invite" as const };

describe("discord state", () => {
  it("round-trips", () => {
    const token = signState(base, SECRET);
    expect(verifyState(token, SECRET, { userId: "user-1" })).toMatchObject(base);
  });

  it("rejects a tampered body or signature", () => {
    const token = signState(base, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...base, u: "user-2", n: "a", e: Date.now() + 1e6 }),
    ).toString("base64url");
    expect(verifyState(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyState(`${body}.${sig}x`, SECRET)).toBeNull();
    expect(verifyState(token, "y".repeat(40))).toBeNull();
    expect(verifyState("garbage", SECRET)).toBeNull();
    expect(verifyState(null, SECRET)).toBeNull();
  });

  it("rejects an expired state", () => {
    const now = 1_000_000;
    const token = signState(base, SECRET, now);
    expect(verifyState(token, SECRET, { now: now + STATE_TTL_MS - 1 })).not.toBeNull();
    expect(verifyState(token, SECRET, { now: now + STATE_TTL_MS + 1 })).toBeNull();
  });

  it("rejects a different signed-in user", () => {
    const token = signState(base, SECRET);
    expect(verifyState(token, SECRET, { userId: "someone-else" })).toBeNull();
  });
});

describe("food group choice", () => {
  it("ends 1,000 sequential assignments within 1 of each other", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const key = pickFoodGroup(counts);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sizes = FOOD_GROUPS.map((g) => counts.get(g.key) ?? 0);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("breaks ties with the random source", () => {
    const counts = new Map<string, number>();
    expect(pickFoodGroup(counts, () => 0)).toBe("cherry_blossom");
    expect(pickFoodGroup(counts, () => 0.999)).toBe("rose");
  });

  it("gives every group a stable number 1 to 8", () => {
    expect(FOOD_GROUPS.map((g) => g.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(foodGroupByKey("tulip")?.number).toBe(3);
  });
});

describe("autoAssignFoodGroups", () => {
  it("logs and resolves when the assignment fails, so an acceptance still succeeds", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { transaction: vi.fn().mockRejectedValue(new Error("db down")) };
    await expect(autoAssignFoodGroups(db as never, "hack-1")).resolves.toBeUndefined();
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("ramadanFlag and config", () => {
  it("is 1 only when opted in and fasting Yes", () => {
    expect(ramadanFlag(true, "Yes")).toBe(1);
    expect(ramadanFlag(true, "No")).toBe(0);
    expect(ramadanFlag(true, null)).toBe(0);
    expect(ramadanFlag(false, "Yes")).toBe(0);
  });

  it("is null unless the three required variables are set", () => {
    expect(discordConfig({})).toBeNull();
    expect(
      discordConfig({ DISCORD_CLIENT_ID: "1", DISCORD_CLIENT_SECRET: "s" }),
    ).toBeNull();
    expect(
      discordConfig({
        DISCORD_CLIENT_ID: "1",
        DISCORD_CLIENT_SECRET: "s",
        DISCORD_INVITE_URL: "https://discord.gg/abc",
      }),
    ).toEqual({
      clientId: "1",
      clientSecret: "s",
      inviteUrl: "https://discord.gg/abc",
    });
  });
});

describe("discord roles", () => {
  const at = new Date("2027-02-01T00:00:00Z");
  const hacker = (registrationStatus: string, attendanceConfirmedAt: Date | null) => ({
    registrationStatus,
    attendanceConfirmedAt,
  });

  it("makes a hacker eligible only once they said they are coming, or are checked in", () => {
    expect(isConfirmedHacker(hacker("approved", null))).toBe(false);
    expect(isConfirmedHacker(hacker("approved", at))).toBe(true);
    expect(isConfirmedHacker(hacker("checked_in", null))).toBe(true);
    for (const status of ["pending", "waitlisted", "rejected"]) {
      expect(isConfirmedHacker(hacker(status, at))).toBe(false);
    }
  });

  it("holds each role independently, and any combination", () => {
    const base = {
      participant: null,
      judge: false,
      staff: false,
      approvedVolunteer: false,
      hackathonStatus: "open",
    };
    expect(rolesFor(base)).toEqual(NO_ROLES);
    expect(rolesFor({ ...base, judge: true })).toEqual({ ...NO_ROLES, judge: true });
    expect(rolesFor({ ...base, staff: true })).toEqual({ ...NO_ROLES, volunteer: true });
    expect(rolesFor({ ...base, approvedVolunteer: true })).toEqual({
      ...NO_ROLES,
      volunteer: true,
    });
    expect(
      rolesFor({ ...base, participant: hacker("approved", at), judge: true, staff: true }),
    ).toEqual({ hacker: true, judge: true, volunteer: true });
    expect(
      rolesFor({ ...base, participant: hacker("approved", null), judge: true }),
    ).toEqual({ hacker: false, judge: true, volunteer: false });
  });

  it("gives the volunteer staff tier a role only while the edition is open or live", () => {
    const volunteerIn = (hackathonStatus: string) =>
      rolesFor({
        participant: null,
        judge: false,
        staff: true,
        approvedVolunteer: false,
        hackathonStatus,
      }).volunteer;
    for (const status of ["open", "closed", "in_progress"]) expect(volunteerIn(status)).toBe(true);
    for (const status of ["draft", "announced", "completed", "cancelled"]) {
      expect(volunteerIn(status)).toBe(false);
    }
  });

  it("gives an approved volunteer a role from the announcement until the edition is over", () => {
    const applicantIn = (hackathonStatus: string) =>
      rolesFor({
        participant: null,
        judge: false,
        staff: false,
        approvedVolunteer: true,
        hackathonStatus,
      }).volunteer;
    for (const status of ["announced", "open", "closed", "in_progress"]) {
      expect(applicantIn(status)).toBe(true);
    }
    for (const status of ["draft", "completed", "cancelled"]) {
      expect(applicantIn(status)).toBe(false);
    }
  });

  it("holds no role at all in an edition that is over", () => {
    for (const hackathonStatus of ["completed", "cancelled"]) {
      expect(
        rolesFor({
          participant: hacker("approved", at),
          judge: true,
          staff: true,
          approvedVolunteer: true,
          hackathonStatus,
        }),
      ).toEqual(NO_ROLES);
    }
  });

  it("reports whether anyone holds a role", () => {
    expect(hasDiscordRole(NO_ROLES)).toBe(false);
    expect(hasDiscordRole({ ...NO_ROLES, volunteer: true })).toBe(true);
  });

  it("always sends all five fields, with the hacker's three at zero for anyone else", () => {
    const flower = { foodGroup: 4, ramadan: 1 as const };
    expect(roleMetadata({ hacker: true, judge: false, volunteer: false }, flower)).toEqual({
      accepted: 1,
      food_group: 4,
      ramadan: 1,
      judge: 0,
      volunteer: 0,
    });
    expect(roleMetadata({ hacker: false, judge: true, volunteer: false }, null)).toEqual({
      ...ZERO_METADATA,
      judge: 1,
    });
    expect(roleMetadata({ hacker: false, judge: false, volunteer: true }, null)).toEqual({
      ...ZERO_METADATA,
      volunteer: 1,
    });
    // A flower is never sent to somebody who is not a confirmed hacker.
    expect(
      roleMetadata({ hacker: false, judge: true, volunteer: false }, { foodGroup: 4, ramadan: 1 }),
    ).toEqual({ ...ZERO_METADATA, judge: 1 });
    expect(roleMetadata({ hacker: false, judge: false, volunteer: false }, null)).toEqual(
      ZERO_METADATA,
    );
    expect(roleMetadata({ hacker: true, judge: true, volunteer: true }, flower)).toEqual({
      accepted: 1,
      food_group: 4,
      ramadan: 1,
      judge: 1,
      volunteer: 1,
    });
  });
});

describe("registered Linked Roles metadata", () => {
  it("is exactly what the link sends, and within Discord's limit of 5 fields", () => {
    const script = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../../tooling/scripts/src/discord-register-metadata.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const registered = [...script.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    const sent = Object.keys(
      roleMetadata(
        { hacker: true, judge: true, volunteer: true },
        { foodGroup: 1, ramadan: 1 },
      ),
    );
    expect([...registered].sort()).toEqual([...sent].sort());
    expect(registered.length).toBeLessThanOrEqual(5);
  });
});

describe("roleSignature", () => {
  it("changes with every field, and ends in the volunteer flag", () => {
    const seen = new Set([roleSignature(ZERO_METADATA)]);
    for (const patch of [
      { accepted: 1 as const },
      { food_group: 3 },
      { ramadan: 1 as const },
      { judge: 1 as const },
      { volunteer: 1 as const },
    ]) {
      seen.add(roleSignature({ ...ZERO_METADATA, ...patch }));
    }
    expect(seen.size).toBe(6);
    expect(roleSignature({ ...ZERO_METADATA, volunteer: 1 })).toMatch(/v1$/);
    expect(roleSignature({ ...ZERO_METADATA, judge: 1 })).not.toMatch(/v1$/);
  });
});

describe("stored Discord tokens", () => {
  const key = "k".repeat(40);

  it("round-trips, and never shows the token in the sealed value", () => {
    const sealed = sealToken("a-discord-access-token", key, "user-1");
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain("a-discord-access-token");
    expect(openToken(sealed, key, "user-1")).toBe("a-discord-access-token");
  });

  it("seals the same token differently each time", () => {
    expect(sealToken("same", key, "user-1")).not.toBe(sealToken("same", key, "user-1"));
  });

  it("does not open for another person, another secret, or a malformed value", () => {
    const sealed = sealToken("tok", key, "user-1");
    expect(openToken(sealed, key, "user-2")).toBeNull();
    expect(openToken(sealed, "j".repeat(40), "user-1")).toBeNull();
    for (const bad of [null, undefined, "", "garbage", "v2.a.b.c", `${sealed}.extra`, "v1.a.b"]) {
      expect(openToken(bad, key, "user-1")).toBeNull();
    }
  });

  it("fails when any part of the ciphertext is changed, or the tag is cut short", () => {
    const [version, iv, ciphertext, tag] = sealToken("tok-to-protect", key, "user-1").split(".");
    const flip = (part: string) => {
      const bytes = Buffer.from(part!, "base64url");
      bytes[0] = bytes[0]! ^ 1;
      return bytes.toString("base64url");
    };
    expect(openToken([version, iv, flip(ciphertext!), tag].join("."), key, "user-1")).toBeNull();
    expect(openToken([version, flip(iv!), ciphertext, tag].join("."), key, "user-1")).toBeNull();
    expect(openToken([version, iv, ciphertext, flip(tag!)].join("."), key, "user-1")).toBeNull();
    const short = Buffer.from(tag!, "base64url").subarray(0, 8).toString("base64url");
    expect(openToken([version, iv, ciphertext, short].join("."), key, "user-1")).toBeNull();
  });
});
