import { QueryClient } from "@tanstack/react-query";

export const PORTAL_CONTEXT_STALE_MS = 30 * 60 * 1000;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
        networkMode: "offlineFirst",
      },
    },
  });
}

export const portalContextQueryOptions = {
  staleTime: PORTAL_CONTEXT_STALE_MS,
  gcTime: 60 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const;
