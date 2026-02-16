import { handlers } from "@query/auth";

const { GET: _GET, POST: _POST } = handlers;

export const GET = _GET as any;
export const POST = _POST as any;

// Return 200 for HEAD requests (email client link preview/prefetch)
// to prevent UnknownAction errors from cluttering logs
export function HEAD() {
    return new Response(null, { status: 200 });
}