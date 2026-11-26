/** The `error` the sign-in route answers with when email codes are at a cap. */
export const CODES_BUSY = "CodesBusy";

type SignInResult = { ok?: boolean; error?: string } | undefined;

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
