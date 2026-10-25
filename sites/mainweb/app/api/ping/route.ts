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
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
