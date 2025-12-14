let inMemoryUsers: Record<string, any> = {};
let inMemorySessions: Record<string, any> = {};

async function tryDb() {
  try {
    const mod = await import('@enigma/db');
    const schema = await import('@enigma/db/schema');
    return { db: mod.db, users: schema.users, sessions: schema.sessions };
  } catch (err) {
    return null;
  }
}

export async function getSessionByToken(token: string) {
  if (!token) return null;
  const dbInfo = await tryDb();
  if (!dbInfo) {
    const s = inMemorySessions[token];
    if (!s) return null;
    const u = inMemoryUsers[s.user_id];
    return { session: s, user: u };
  }
  const { db, sessions, users } = dbInfo;
  const s = await db.select().from(sessions).where(sessions.session_token.eq(token)).then(r => r[0]);
  if (!s) return null;
  const u = await db.select().from(users).where(users.id.eq(s.user_id)).then(r => r[0]);
  return { session: s, user: u };
}

export async function deleteSessionByToken(token: string) {
  if (!token) return;
  const dbInfo = await tryDb();
  if (!dbInfo) {
    delete inMemorySessions[token];
    return;
  }
  const { db, sessions } = dbInfo;
  await db.delete(sessions).where(sessions.session_token.eq(token)).run();
}

export async function createContext({ req }: { req?: Request } = {}) {
  const cookies = req?.headers.get('cookie') ?? '';
  const match = /(?:^|; )enigma_session=([^;]+)/.exec(cookies);
  const token = match?.[1];
  if (!token) return { user: null };

  const session = await getSessionByToken(token);
  if (!session) return { user: null };

  return { user: session.user, session: session.session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
