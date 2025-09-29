import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  // Example: allow all requests
  return NextResponse.next();
}

// Optional: define paths where middleware runs
export const config = {
  matcher: '/:path*', // run for all routes
};
