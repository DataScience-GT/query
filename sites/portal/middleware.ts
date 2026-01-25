import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // Simple in-memory rate limiting implementation
  // Note: specific to this server instance. For scale, use Redis/KV.
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/auth')) {
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  const protectedPaths = ['/admin', '/dashboard'];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  let response = NextResponse.next();

  if (isProtected) {
    // Check for session tokens: legacy, NextAuth v4, and NextAuth v5 (authjs)
    const token = req.cookies.get('query_session')?.value ||
      req.cookies.get('next-auth.session-token')?.value ||
      req.cookies.get('__Secure-next-auth.session-token')?.value ||
      req.cookies.get('authjs.session-token')?.value ||
      req.cookies.get('__Secure-authjs.session-token')?.value;

    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      response = NextResponse.redirect(url);
    }
  }

  // Add Security Headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  return response;
}

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const WINDOW_SIZE = 10 * 1000; // 10 seconds
const LIMIT = 10; // 10 requests per window

function checkRateLimit(ip: string) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  if (now - record.lastReset > WINDOW_SIZE) {
    record.count = 0;
    record.lastReset = now;
  }

  record.count++;
  rateLimitMap.set(ip, record);

  return { allowed: record.count <= LIMIT };
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/api/auth/:path*'],
};
