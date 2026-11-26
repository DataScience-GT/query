/** The `error` the sign-in route answers with when email codes are at a cap. */
export const CODES_BUSY = "CodesBusy";

/**
 * The `notice` the sign-in route answers with when the email held a sign-in link
 * instead of a code, because wrong guesses have paused codes for the address.
 */
export const CODES_PAUSED = "CodesPaused";

type SignInResult =
  | { ok?: boolean; error?: string; url?: string | null }
  | undefined;

/** Whether the email that went out holds a link, with no code to wait for. */
export function linkOnlySent(res: SignInResult): boolean {
  if (!res?.ok || res.error || !res.url) return false;
  try {
    return new URL(res.url).searchParams.get("notice") === CODES_PAUSED;
  } catch {
    return false;
  }
}

/** What to tell someone whose address is locked out of codes, once a link is sent. */
export const linkSentMessage = (email: string) =>
  `Codes for this address are paused for a while after too many wrong tries. We emailed a sign-in link to ${email} instead. Open it on this device.`;

/**
 * What to tell someone whose request for an email code did not go out, or null
 * when it did. A cap is not a problem with their address, and is not a reason
 * to say a code was sent, so it points at the ways in that do not need one.
 */
export function emailSignInProblem(
  res: SignInResult,
  options: { discord: boolean; inAppBrowser: boolean },
): string | null {
  if (res?.ok && !res.error) return null;
  if (res?.error !== CODES_BUSY) {
    return "We couldn't send a code to that address. Check it and try again.";
  }

  // Google refuses to run inside another app's browser.
  const others = [
    ...(options.inAppBrowser ? [] : ["Google"]),
    ...(options.discord ? ["Discord"] : []),
  ];
  const instead = others.length
    ? `, or continue with ${others.join(" or ")}`
    : options.inAppBrowser
      ? ", or open this page in Safari or Chrome to use Google"
      : "";
  return `Email codes are busy right now. Try again in a few minutes${instead}.`;
}
