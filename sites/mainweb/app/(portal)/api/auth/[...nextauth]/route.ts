import { handlers } from "@query/auth";

export const { GET, POST } = handlers;

// Return 200 for HEAD requests (email client link preview/prefetch)
// to prevent UnknownAction errors from cluttering logs
export function HEAD() {
    return new Response(null, { status: 200 });
}