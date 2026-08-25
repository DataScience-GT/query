/**
 * Where to send somebody after they sign in, when they arrived from a page that
 * asked them to.
 *
 * Only a same-origin path is ever honoured. A bare `startsWith("/")` is not
 * enough: `//evil.example` and `/\evil.example` are both protocol-relative, so
 * a browser treats them as another origin and an attacker gets a redirect off
 * this site carrying whatever the user does next.
 *
 * Shared by the login screen and the email-code screen because the value has to
 * survive the hop between them, and a second copy of this check is a second
 * place for the guard to be wrong.
 */
export function safeCallback(raw: string | null | undefined): string | null {
  if (!raw) return null;

  /**
   * URL parsing removes every ASCII tab and newline from the input before the
   * browser works out what origin the value points at (WHATWG URL, "remove all
   * ASCII tab or newline"). So `/\t/evil.example` is read as `//evil.example` —
   * protocol-relative, another origin — while the prefix checks below see a
   * path that starts with a single slash and let it through.
   *
   * `?callbackUrl=/%09/evil.example` is all it takes to reach that, and the
   * verify screen assigns the result straight to `window.location.href`, so the
   * redirect lands on somebody who has just proved who they are.
   *
   * A legitimate destination never contains one of these, so they are refused
   * rather than stripped — nothing downstream then has to wonder whether it is
   * holding the string that was checked.
   */
  if (/[\t\n\r]/.test(raw)) return null;

  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
