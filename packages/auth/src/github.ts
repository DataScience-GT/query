/** One entry of GitHub's `GET /user/emails`. */
export type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

/**
 * The address a GitHub sign-in is allowed to claim: the primary one if it is
 * verified, otherwise any verified one, otherwise none.
 *
 * Auth.js's default takes the primary (or first) address from /user/emails
 * without looking at `verified`. With email account linking on, that let
 * someone add a member's address to their own GitHub account, never verify
 * it, and sign in as that member.
 */
export function verifiedGitHubEmail(emails: GitHubEmail[]): string | null {
  const verified = emails.filter((entry) => entry.verified);
  return (
    (verified.find((entry) => entry.primary) ?? verified[0])?.email ?? null
  );
}

/**
 * GitHub's `GET /user`. A rate limit or a revoked token answers with an error
 * body that is still JSON, and spreading that into the profile sends Auth.js a
 * "user" with no id, so a failed lookup is thrown instead of passed along.
 */
export async function fetchGitHubProfile(
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.github.com/user", { headers });
  if (!res.ok) throw new Error(`GitHub /user responded ${res.status}`);
  return res.json();
}
