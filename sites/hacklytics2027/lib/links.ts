/**
 * Outbound destinations, in one place.
 *
 * This site is a static export, so anything dynamic — the interest list, and
 * later registration itself — lives elsewhere and is reached by absolute URL.
 * Every button reads it from here: it used to be pasted into four separate
 * files, and the homepage, both navbars and the JSON-LD offer each had to be
 * found and edited by hand every time the destination moved.
 */

/** The portal origin. Matches BASE_URL / NEXTAUTH_URL in apphosting.yaml. */
export const PORTAL_ORIGIN = "https://datasciencegt.org";

/**
 * Where every Notify me / sign-up button goes: a Typeform, for now. The
 * portal flow below is what it returns to once registration opens there —
 * swap INTEREST_URL back to PORTAL_INTEREST_URL.
 */
export const INTEREST_URL = "https://form.typeform.com/to/GvqBCdAe";

/** Where somebody ends up after signing in. */
const INTEREST_PATH = "/hacklytics";

/**
 * The portal's interest form, entered through sign-in.
 *
 * Joining the list requires an account so the address on it is verified, and
 * asking for that up front beats asking halfway through the form. The
 * callbackUrl carries the destination through the whole login chain —
 * including the email-code path, which hands off through /verify — so people
 * land on the form itself rather than on a dashboard they did not ask for.
 *
 * Encoded because it is a query-parameter value; the portal only honours
 * same-origin paths, so this has to arrive intact to be accepted.
 */
export const PORTAL_INTEREST_URL = `${PORTAL_ORIGIN}/login?callbackUrl=${encodeURIComponent(
  INTEREST_PATH,
)}`;

