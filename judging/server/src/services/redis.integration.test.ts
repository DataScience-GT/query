import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { createRedisBus } from "../bus";

const url = process.env.REDIS_URL;

async function redisAnswers(address: string): Promise<boolean> {
  const client = new Redis(address, {
    maxRetriesPerRequest: 0,
    connectTimeout: 500,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  client.on("error", () => undefined);
  try {
    await client.connect();
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

describe.skipIf(!url)("redis bus", () => {
  it("delivers a message from one connection to another", async (ctx) => {
    if (!(await redisAnswers(url as string))) ctx.skip();
    const left = createRedisBus(url as string);
    const right = createRedisBus(url as string);
    const seen = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no redis message")), 4000);
      right.subscribe("event:test:board", (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    left.publish("event:test:board", { kind: "vote.cast" });
    await expect(seen).resolves.toEqual({ kind: "vote.cast" });
  });
});
