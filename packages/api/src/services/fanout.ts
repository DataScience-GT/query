/**
 * Runs a bounded number of async tasks at once.
 *
 * Written for the mail loops. The SMTP transport is pooled — five connections
 * by default — but every send site awaited one message at a time, so four of
 * those connections sat idle while a batch of hundreds ran at the speed of one
 * round trip each. Cloud Run kills a request at 300s, which a sequential batch
 * reaches well before the send limit does.
 *
 * `worker` is expected to handle its own failures: a rejection here aborts the
 * remaining work, which is not what a partly-sent batch wants.
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]!, index);
    }
  });

  await Promise.all(runners);
}

/**
 * How many messages may be in flight at once: the size of the SMTP pool, since
 * anything beyond it only queues inside nodemailer.
 */
export const emailConcurrency = () =>
  Math.max(1, Number(process.env.EMAIL_MAX_CONNECTIONS || "5"));
