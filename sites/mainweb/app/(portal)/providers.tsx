"use client";

import { SessionProvider } from "next-auth/react";
import {
  HydrationBoundary,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import { createAppQueryClient } from "@/lib/query-client";
import { AppThemeProvider } from "@/components/portal/AppThemeProvider";

export function Providers({
  children,
  session,
  state,
}: {
  children: React.ReactNode;
  session?: Session;
  state?: DehydratedState;
}) {
  const [queryClient] = useState(() => createAppQueryClient());

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <AppThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <SessionProvider basePath="/api/auth" session={session}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <HydrationBoundary state={state}>{children}</HydrationBoundary>
          </QueryClientProvider>
        </trpc.Provider>
      </SessionProvider>
    </AppThemeProvider>
  );
}
