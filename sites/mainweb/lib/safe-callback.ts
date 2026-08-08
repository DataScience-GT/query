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
  if (!raw || !raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
