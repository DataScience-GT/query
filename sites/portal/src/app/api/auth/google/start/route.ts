import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? 'http://localhost:3002'}/api/auth/google/callback`;
  const state = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : String(Date.now());

  const params = new URLSearchParams({
    client_id: clientId ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  // set short-lived state cookie to validate in callback (prevent CSRF)
  res.cookies.set('oauth_state', state, { httpOnly: true, path: '/api/auth/google/callback', maxAge: 300, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res;
}
