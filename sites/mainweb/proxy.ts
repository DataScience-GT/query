
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Convert to lowercase for case-insensitive matching
    const lowerPath = pathname.toLowerCase();

    // Block common bot/scanner paths
    if (
        lowerPath.includes('.php') ||
        lowerPath.includes('.asp') ||
        lowerPath.includes('.env') ||
        lowerPath.includes('/wp-') ||
        lowerPath.includes('/wordpress/') ||
        lowerPath.includes('.git/') ||
        lowerPath.includes('actuator/')
    ) {
        return new NextResponse(null, { status: 403, statusText: 'Forbidden' });
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
