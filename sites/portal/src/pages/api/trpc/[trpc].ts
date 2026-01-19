import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter, createContext } from '@query/api';
import type { NextApiRequest, NextApiResponse } from 'next';

// Create the TRPC handler for Pages Router (Node.js HTTP)
// The createContext function will be called with the proper options
export default createNextApiHandler({
    router: appRouter,
    createContext: async ({ req, res }) => {
        // Extract client IP from headers (for Firebase Cloud Functions)
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = typeof forwarded === 'string'
            ? forwarded.split(',')[0].trim()
            : req.socket?.remoteAddress || 'unknown';

        // Call createContext with just the clientIp since we're in Pages Router
        // The context function will handle the rest
        return createContext({ clientIp } as any);
    },
    onError: ({ error, path }) => {
        console.error(`[TRPC Error] ${path}:`, error.message);
    },
});
