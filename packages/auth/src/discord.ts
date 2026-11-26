import DiscordProvider from "next-auth/providers/discord";

/**
 * What Discord sign-in asks for: who the person is and their address, nothing
 * else. Never `role_connections.write`. Discord roles come only from the Linked
 * Roles flow (`/api/discord/connect`) after a hacker is accepted, and a login
 * token without that scope cannot write them.
 */
export const DISCORD_LOGIN_SCOPE = "identify email";

type Env = Record<string, string | undefined>;

/**
 * True when both client variables are set. The provider list below and the
 * /login page read this one answer, so the button shows exactly when the
 * provider is registered.
 */
export function discordLoginEnabled(env: Env = process.env): boolean {
  return !!env.DISCORD_CLIENT_ID && !!env.DISCORD_CLIENT_SECRET;
}

/**
 * The sign-in address Discord vouches for. `allowDangerousEmailAccountLinking`
 * attaches this login to whichever member owns the address, so an address the
 * person never confirmed with Discord must not count. Discord sets `verified`
 * on its profile; false, missing, or no email at all rejects the sign-in.
 */
export function hasVerifiedDiscordEmail(
  profile: { verified?: unknown; email?: unknown } | null | undefined,
): boolean {
  return profile?.verified === true && !!profile.email;
}

/** One Discord provider when configured, none otherwise. */
export function discordProviders(env: Env = process.env) {
  const { DISCORD_CLIENT_ID: clientId, DISCORD_CLIENT_SECRET: clientSecret } =
    env;
  if (!clientId || !clientSecret) return [];
  return [
    DiscordProvider({
      clientId,
      clientSecret,
      // Matches Google: a member who first signed in with Google or an email
      // code can use Discord on the same verified address instead of hitting
      // OAuthAccountNotLinked. The `signIn` callback enforces the verified half.
      allowDangerousEmailAccountLinking: true,
      // PKCE + state are the CSRF protection on the callback; with email linking
      // on, a forged callback could attach an attacker's identity to a member.
      checks: ["pkce", "state"],
      authorization: { params: { scope: DISCORD_LOGIN_SCOPE } },
    }),
  ];
}
