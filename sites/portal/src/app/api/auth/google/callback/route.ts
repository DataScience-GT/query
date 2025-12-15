import { NextResponse } from 'next/server';
import { upsertUserFromGoogle, createSession } from '@query/auth';

async function exchangeCode(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID ?? '',
    client_secret: process.env.AUTH_GOOGLE_SECRET ?? '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return res.json();
}

async function fetchProfile(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  // validate state against short-lived cookie
  const cookies = req.headers.get('cookie') ?? '';
  const m = /(?:^|; )oauth_state=([^;]+)/.exec(cookies);
  const cookieState = m?.[1];
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: 'Invalid or missing OAuth state' }, { status: 400 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? 'http://localhost:3002'}/api/auth/google/callback`;
  const tokenRes = await exchangeCode(code, redirectUri);
  if (!tokenRes.access_token) return NextResponse.json({ error: 'Token exchange failed', details: tokenRes }, { status: 500 });

  const profile = await fetchProfile(tokenRes.access_token);
  const user = await upsertUserFromGoogle({ email: profile.email, name: profile.name, image: profile.picture, email_verified: profile.email_verified });

  const session = await createSession(user.id);

  const res = NextResponse.redirect(process.env.NEXT_PUBLIC_APP_URL ?? '/');
  res.cookies.set('query_session', session.token, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  // clear oauth_state cookie
  res.cookies.set('oauth_state', '', { path: '/api/auth/google/callback', maxAge: 0 });

  return res;
}
