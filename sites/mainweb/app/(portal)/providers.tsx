'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';

import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {


  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Increased staleTime for better cache reuse and lower latency
        staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh enough for most users
        // gcTime controls how long to keep the query in memory before GC,
        // allowing background updates to work even when not viewed
        gcTime: 30 * 60 * 1000, // 30 minutes
        // Background refetch to keep data fresh when user navigates away
        refetchOnWindowFocus: true,
        retry: 1, // Retry once on failure
        networkMode: "offlineFirst", // Cache-first strategy for better offline support
      },
    },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          headers() {
            return {
              // Cookies are automatically sent by the browser
            };
          },
        }),
      ],
    })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SessionProvider basePath="/api/auth">
        <QueryClientProvider client={queryClient}>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            {children}
          </trpc.Provider>
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}