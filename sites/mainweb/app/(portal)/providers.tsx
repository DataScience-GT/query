"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import { createAppQueryClient } from "@/lib/query-client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

function AppThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider> & { children: ReactNode }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
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
    <AppThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SessionProvider basePath="/api/auth">
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </trpc.Provider>
      </SessionProvider>
    </AppThemeProvider>
  );
}
