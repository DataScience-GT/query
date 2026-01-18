/**
 * HTTP Security Headers and Utilities
 * Provides comprehensive security headers for API responses
 */

export interface SecurityHeaders {
    'X-Content-Type-Options': string;
    'X-Frame-Options': string;
    'X-XSS-Protection': string;
    'Strict-Transport-Security': string;
    'Content-Security-Policy': string;
    'Referrer-Policy': string;
    'Permissions-Policy': string;
}

export interface CacheHeaders {
    'Cache-Control': string;
    'Vary': string;
}

export interface RateLimitHeaders {
    'X-RateLimit-Limit': string;
    'X-RateLimit-Remaining': string;
    'X-RateLimit-Reset': string;
    'Retry-After'?: string;
}

/**
 * Generate strict security headers for API responses
 */
export function getSecurityHeaders(): SecurityHeaders {
    return {
        // Prevent MIME type sniffing
        'X-Content-Type-Options': 'nosniff',

        // Prevent clickjacking
        'X-Frame-Options': 'DENY',

        // Enable XSS protection (legacy but still useful)
        'X-XSS-Protection': '1; mode=block',

        // Force HTTPS for 1 year
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',

        // Content Security Policy - strict for API
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",

        // Referrer policy
        'Referrer-Policy': 'strict-origin-when-cross-origin',

        // Permissions policy - disable all features
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    };
}

/**
 * Generate cache control headers based on cacheability
 */
export function getCacheHeaders(options: {
    cacheable: boolean;
    maxAge?: number;
    private?: boolean;
    mustRevalidate?: boolean;
}): CacheHeaders {
    const { cacheable, maxAge = 300, private: isPrivate = true, mustRevalidate = true } = options;

    if (!cacheable) {
        return {
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Vary': 'Accept-Encoding, Authorization',
        };
    }

    const directives = [
        isPrivate ? 'private' : 'public',
        `max-age=${maxAge}`,
    ];

    if (mustRevalidate) {
        directives.push('must-revalidate');
    }

    return {
        'Cache-Control': directives.join(', '),
        'Vary': 'Accept-Encoding, Authorization',
    };
}

/**
 * Generate rate limit headers
 */
export function getRateLimitHeaders(
    limit: number,
    remaining: number,
    resetTimestamp: number,
    retryAfter?: number
): RateLimitHeaders {
    const headers: RateLimitHeaders = {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
        'X-RateLimit-Reset': resetTimestamp.toString(),
    };

    if (retryAfter !== undefined) {
        headers['Retry-After'] = retryAfter.toString();
    }

    return headers;
}

/**
 * Get client IP address from request, considering proxies
 */
export function getClientIp(request: Request): string {
    // Check X-Forwarded-For header (from proxies/load balancers)
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        // Take the first IP in the chain
        return forwardedFor.split(',')[0]?.trim() || 'unknown';
    }

    // Check X-Real-IP header
    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp.trim();
    }

    // Fallback to unknown
    return 'unknown';
}

/**
 * Generate a fingerprint for rate limiting
 * Combines IP, user agent, and other factors
 */
export function getRequestFingerprint(request: Request, userId?: string): string {
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Hash the user agent to keep fingerprint shorter
    const uaHash = simpleHash(userAgent);

    if (userId) {
        return `user:${userId}:${ip}`;
    }

    return `anon:${ip}:${uaHash}`;
}

/**
 * Simple hash function for strings
 */
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Apply all headers to a Response object
 */
export function applySecurityHeaders(
    response: Response,
    options?: {
        cacheable?: boolean;
        maxAge?: number;
        rateLimit?: {
            limit: number;
            remaining: number;
            reset: number;
            retryAfter?: number;
        };
    }
): Response {
    const headers = new Headers(response.headers);

    // Apply security headers
    const securityHeaders = getSecurityHeaders();
    Object.entries(securityHeaders).forEach(([key, value]) => {
        headers.set(key, value);
    });

    // Apply cache headers
    const cacheHeaders = getCacheHeaders({
        cacheable: options?.cacheable ?? false,
        maxAge: options?.maxAge,
    });
    Object.entries(cacheHeaders).forEach(([key, value]) => {
        headers.set(key, value);
    });

    // Apply rate limit headers if provided
    if (options?.rateLimit) {
        const rateLimitHeaders = getRateLimitHeaders(
            options.rateLimit.limit,
            options.rateLimit.remaining,
            options.rateLimit.reset,
            options.rateLimit.retryAfter
        );
        Object.entries(rateLimitHeaders).forEach(([key, value]) => {
            if (value !== undefined) {
                headers.set(key, value);
            }
        });
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
