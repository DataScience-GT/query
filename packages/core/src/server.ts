import { SITE_ORIGIN } from "./site";

/** The origin NextAuth is configured with, or undefined when neither variable is set. */
export function configuredSiteOrigin(): string | undefined {
  return process.env.NEXTAUTH_URL || process.env.AUTH_URL || undefined;
}

/** The public origin: the configured one, else the production site. */
export function siteOrigin(): string {
  return configuredSiteOrigin() ?? SITE_ORIGIN;
}
