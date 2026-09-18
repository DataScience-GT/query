/**
 * Runs a bounded number of async tasks at once.
 *
 * For the mail loops: the SMTP transport is pooled at five connections, but
 * every send site awaited one message at a time, and Cloud Run kills a request
 * at 300s. `worker` must handle its own failures — a rejection aborts the rest.
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

/** The SMTP pool size; anything beyond it only queues inside nodemailer. */
export const emailConcurrency = () =>
  Math.max(1, Number(process.env.EMAIL_MAX_CONNECTIONS || "5"));
