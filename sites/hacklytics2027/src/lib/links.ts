/**
 * Outbound destinations, in one place.
 *
 * This site is a static export, so anything dynamic — the interest list, and
 * later registration itself — lives elsewhere and is reached by absolute URL.
 * Every button reads it from here: it used to be pasted into four separate
 * files, and the homepage, both navbars and the JSON-LD offer each had to be
 * found and edited by hand every time the destination moved.
 */

/** Organisation social profiles. Mirrors SOCIAL_LINKS in @query/db/constants; this site does not depend on that package. */
export const SOCIAL_LINKS = {
  github: "https://github.com/DataScience-GT",
  linkedin: "https://www.linkedin.com/company/dsgt/",
  instagram: "https://www.instagram.com/datasciencegt/",
} as const;

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

/** The Hacklytics page on the portal, where hackers apply and follow along. */
export const PORTAL_HACKATHON_URL = `${PORTAL_ORIGIN}/hacklytics`;

/** Judge sign-in, landing on the judging dashboard once signed in. */
export const JUDGE_URL = `${PORTAL_ORIGIN}/login?callbackUrl=${encodeURIComponent(
  "/judge",
)}`;


/** The judge application form, entered through sign-in like the rest of the portal. */
export const JUDGE_SIGNUP_URL = `${PORTAL_ORIGIN}/login?callbackUrl=${encodeURIComponent(
  "/judge/register",
)}`;

/**
 * Where the judge interest form posts. A public, rate-limited endpoint on the
 * portal that accepts this site's origins. On a loopback host it talks to a
 * local portal (port 3001) so the form can be tried without touching the real
 * list. A function because it reads the page's hostname, which the build cannot.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const judgeInterestUrl = () =>
  `${
    typeof window !== "undefined" && LOOPBACK_HOSTS.has(window.location.hostname)
      ? "http://localhost:3001"
      : PORTAL_ORIGIN
  }/api/judge-interest`;
