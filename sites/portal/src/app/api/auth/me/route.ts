import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@query/auth';

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: session.user });
}

