import { describe, expect, it, vi } from "vitest";
import { discordConfig, FOOD_GROUPS, foodGroupByKey } from "./config";
import { autoAssignFoodGroups, pickFoodGroup } from "./food-group";
import { ramadanFlag } from "./link";
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
