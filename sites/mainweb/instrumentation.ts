/**
 * Runs once per server instance, before the first request is served.
 *
 * Only the pool warmup lives here. `register` blocks the server from accepting
 * requests until it returns, so the warmup is started and deliberately not
 * awaited: opening the sockets alongside the rest of boot is the point, and a
 * database that is slow to reach must not hold the instance out of rotation.
 */
export function register() {
  // Also runs for the edge runtime, which has no pg pool to warm.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  void import("@query/db")
    .then(({ warmPool }) => warmPool())
    .catch(() => {
      // Swallowed: the first query reports an unreachable database far better
      // than a boot-time log nobody reads.
    });
}
