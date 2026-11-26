import { AsyncLocalStorage } from "node:async_hooks";

// What the sign-in route knows about one request for an email code that the
// code-sending hook cannot see for itself. Auth.js calls the hook without the
// resolved client address, and answers "sent" whatever the hook did, so the two
// ride along in async context: the route says who is asking, the hook says
// whether a cap kept the code back, and the route answers accordingly.

type CodeRequest = { clientIp: string; busy: boolean };

const requests = new AsyncLocalStorage<CodeRequest>();

/**
 * Runs `handle` as one request for a code from `clientIp`. `busy` is true when
 * a cap refused to send one, so the caller must not answer as if it had.
 */
export async function runCodeRequest<T>(
  clientIp: string,
  handle: () => Promise<T>,
): Promise<{ response: T; busy: boolean }> {
  const request: CodeRequest = { clientIp, busy: false };
  const response = await requests.run(request, handle);
  return { response, busy: request.busy };
}

/** The client asking for the code being sent now, when the route said. */
export const currentClientIp = () => requests.getStore()?.clientIp ?? null;

/** Records that the code now being asked for was refused, not sent. */
export function markCodesBusy() {
  const request = requests.getStore();
  if (request) request.busy = true;
}
