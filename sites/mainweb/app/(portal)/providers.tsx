"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import {
  HydrationBoundary,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { httpBatchLink } from "@trpc/client";
import { useEffect, useState } from "react";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import { createAppQueryClient } from "@/lib/query-client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes writes the portal theme onto <html> (a `light` or `dark` class
// and an inline color-scheme) and leaves it there when the portal unmounts. A
// client-side move back to a marketing page, such as the browser's back button,
// then kept the portal's light ramp on the dark site until a reload. Clearing
// it on unmount hands those pages back their own dark default.
function ClearThemeOnLeave() {
  useEffect(
    () => () => {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.style.removeProperty("color-scheme");
    },
    [],
  );
  return null;
}

function AppThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider> & { children: ReactNode }) {
  return (
    <NextThemesProvider {...props}>
      <ClearThemeOnLeave />
      {children}
    </NextThemesProvider>
  );
}

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
