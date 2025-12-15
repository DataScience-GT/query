import { NextResponse } from 'next/server';
import { deleteSessionByToken } from '@query/api/context';

export async function POST(req: Request) {
  const cookies = req.headers.get('cookie') ?? '';
  const match = /(?:^|; )query_session=([^;]+)/.exec(cookies);
  const token = match?.[1];
  if (token) {
    await deleteSession(token).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('query_session', '', { path: '/', maxAge: 0 });
  return res;
}
