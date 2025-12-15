import { v4 as uuidv4 } from 'uuid';

let inMemoryUsers: Record<string, any> = {};
let inMemorySessions: Record<string, any> = {};

async function tryDb() {
  try {
    // dynamic import so packages/db doesn't need to resolve at build time
    // (allows dev without Postgres)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@query/db');
    // also import schema
    const schema = await import('@query/db/schema');
    return { db: mod.db, users: schema.users, sessions: schema.sessions };
  } catch (err) {
    return null;
  }
}

export async function upsertUserFromGoogle(profile: { email: string; name?: string; image?: string; email_verified?: string | null }) {
  const dbInfo = await tryDb();
  if (!dbInfo) {
    // fallback to in-memory
    let u = Object.values(inMemoryUsers).find((x: any) => x.email === profile.email);
    if (u) {
      u = { ...u, name: profile.name ?? u.name, image: profile.image ?? u.image };
      inMemoryUsers[u.id] = u;
      return u;
    }
    const id = uuidv4();
    const newUser = { id, name: profile.name, email: profile.email, image: profile.image };
    inMemoryUsers[id] = newUser;
    return newUser;
  }

  const { db, users } = dbInfo;
  const existing = await db.select().from(users).where(users.email.eq(profile.email)).then(r => r[0]);
  if (existing) {
    await db.update(users).set({ name: profile.name ?? existing.name, image: profile.image ?? existing.image }).where(users.id.eq(existing.id));
    return { ...existing, name: profile.name ?? existing.name, image: profile.image ?? existing.image };
  }

  const res = await db.insert(users).values({ id: uuidv4(), name: profile.name, email: profile.email, image: profile.image }).returning();
  return res[0];
}

export async function createSession(userId: string) {
  const dbInfo = await tryDb();
  const token = uuidv4();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
  if (!dbInfo) {
    const id = uuidv4();
    inMemorySessions[token] = { id, session_token: token, user_id: userId, expires };
    return { token, expires };
  }
  const { db, sessions } = dbInfo;
  await db.insert(sessions).values({ id: uuidv4(), session_token: token, user_id: userId, expires }).run();
  return { token, expires };
}

export async function getSessionByToken(token: string) {
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

export async function deleteSession(token: string) {
  const dbInfo = await tryDb();
  if (!dbInfo) {
    delete inMemorySessions[token];
    return;
  }
  const { db, sessions } = dbInfo;
  await db.delete(sessions).where(sessions.session_token.eq(token)).run();
}

export function getTokenFromRequest(req: Request) {
  const cookies = req.headers.get('cookie') ?? '';
  const match = /(?:^|; )query_session=([^;]+)/.exec(cookies);
  return match?.[1] ?? null;
}

export async function getSessionFromRequest(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return getSessionByToken(token);
}

export function setSessionCookie(res: any, token: string) {
  try {
    res.cookies.set('query_session', token, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  } catch (err) {
    const prev = res.headers?.get?.('set-cookie') ?? '';
    res.headers?.set?.('set-cookie', `${prev}; query_session=${token}; Path=/; HttpOnly`);
  }
}

export function clearSessionCookie(res: any) {
  try {
    res.cookies.set('query_session', '', { path: '/', maxAge: 0 });
  } catch (err) {
    res.headers?.set?.('set-cookie', 'query_session=; Path=/; Max-Age=0');
  }
}

