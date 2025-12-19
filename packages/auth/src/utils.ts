import { auth } from "./auth";

/**
 * Get the current session server-side
 */
export async function getSession() {
  return await auth();
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  // TypeScript now knows session.user exists
  return session;
}

/**
 * Get current user ID
 */
export async function getCurrentUserId() {
  const session = await requireAuth();
  // Using non-null assertion since requireAuth guarantees session.user exists
  return session.user!.id;
}
