/**
 * Target for the external uptime probe (.github/workflows/uptime.yml).
 *
 * Touches nothing: no database, no auth, no session. That is the point. The
 * probe hits this every five minutes, and Neon bills compute while awake and
 * only suspends after about five idle minutes, so a probe that reached the
 * database would keep it awake around the clock. It is also not a tRPC route,
 * so it does not count as traffic in the status samples.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      ok: true,
      version: process.env.NEXT_PUBLIC_APP_VERSION,
      commit: process.env.NEXT_PUBLIC_APP_COMMIT,
      // Whether shared Redis is configured, read from env: no network call, and
      // not an import of @query/api, which would pull the database in here.
      cache:
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
          ? "redis"
          : "memory",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
