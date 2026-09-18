/**
 * Runs once per server instance, before the first request.
 *
 * `register` blocks the server until it returns, so the warmup is started and
 * deliberately not awaited — a slow database must not hold boot open.
 */
export function register() {
  // Also runs for the edge runtime, which has no pg pool to warm.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  void import("@query/db")
    .then(({ warmPool }) => warmPool())
    .catch(() => {
      // The first real query reports an unreachable database better than this.
    });
}
