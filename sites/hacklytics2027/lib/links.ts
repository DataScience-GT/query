/**
 * Outbound destinations, in one place.
 *
 * This site is a static export, so anything dynamic — the interest list, and
 * later registration itself — lives on the portal and is reached by absolute
 * URL. The Typeform this replaced was pasted into four separate files, which is
 * how the homepage, both navbars and the JSON-LD offer all had to be found and
 * edited by hand every time the destination moved.
 */

/** The portal origin. Matches BASE_URL / NEXTAUTH_URL in apphosting.yaml. */
export const PORTAL_ORIGIN = "https://datasciencegt.org";

/** Where somebody ends up after signing in. */
const INTEREST_PATH = "/hacklytics";

/**
 * The interest form, entered through sign-in.
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
export const INTEREST_URL = `${PORTAL_ORIGIN}/login?callbackUrl=${encodeURIComponent(
  INTEREST_PATH,
)}`;

/** Caption next to Notify me. This marketing site has no form. */
export const INTEREST_HINT =
  "Opens the DS@GT portal. We don't collect emails here.";
