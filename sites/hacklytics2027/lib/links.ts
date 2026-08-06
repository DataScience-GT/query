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

/**
 * The announced-edition landing page and interest form. Signing in is required
 * to join the list, so the address behind it is verified — this link goes to
 * the page that explains that, not straight into a login screen.
 */
export const INTEREST_URL = `${PORTAL_ORIGIN}/hacklytics`;
