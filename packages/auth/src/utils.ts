import { auth } from "./auth";

export async function getSession() {
  return await auth();
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getCurrentUserId(): Promise<string> {
  const session = await requireAuth();
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("User ID not found in session");
  }
  return userId;
}