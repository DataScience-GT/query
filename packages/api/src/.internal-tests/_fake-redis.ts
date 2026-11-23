import type { RedisClient, RedisPipeline } from "../lib/redis";

/** In-memory stand-in for the slice of Redis the API calls. No network. */
export class FakeRedis implements RedisClient {
  private counters = new Map<string, number>();
  private streams = new Map<string, { id: string; fields: Record<string, string> }[]>();
  private seq = 0;
  /** "error" rejects every command; "hang" never answers. */
  mode: "ok" | "error" | "hang" = "ok";
  commands = 0;

  private async gate<T>(run: () => T): Promise<T> {
    this.commands++;
    if (this.mode === "error") throw new Error("fake redis down");
    if (this.mode === "hang") return new Promise<T>(() => {});
    return run();
  }

  pipeline(): RedisPipeline {
    const ops: (() => unknown)[] = [];
    const pipe: RedisPipeline = {
      incrby: (key, by) => {
        ops.push(() => {
          const next = (this.counters.get(key) ?? 0) + by;
          this.counters.set(key, next);
          return next;
        });
        return pipe;
      },
      pexpire: () => {
        ops.push(() => 1);
        return pipe;
      },
      exec: () => this.gate(() => ops.map((op) => op())),
    };
    return pipe;
  }

  xadd(key: string, _id: "*", entries: Record<string, string>) {
    return this.gate(() => {
      const id = `${1000 + this.seq}-0`;
      this.seq++;
      const list = this.streams.get(key) ?? [];
      list.push({ id, fields: { ...entries } });
      this.streams.set(key, list);
      return id;
    });
  }

  xrange(key: string, start: string, _end: string, count?: number) {
    return this.gate(() => {
      const exclusive = start.startsWith("(");
      const from = Number.parseInt((exclusive ? start.slice(1) : start).split("-")[0]!, 10);
      const out: Record<string, Record<string, unknown>> = {};
      let n = 0;
      for (const entry of this.streams.get(key) ?? []) {
        const at = Number.parseInt(entry.id.split("-")[0]!, 10);
        if (exclusive ? at <= from : at < from) continue;
        if (count !== undefined && n >= count) break;
        out[entry.id] = entry.fields;
        n++;
      }
      return out;
    });
  }
}
