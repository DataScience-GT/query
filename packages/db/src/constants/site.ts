export const SITE_ORIGIN = "https://datasciencegt.org";

export function siteOrigin(): string {
  return process.env.NEXTAUTH_URL || process.env.AUTH_URL || SITE_ORIGIN;
}
