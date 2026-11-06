import { HydrationBoundary } from "@tanstack/react-query";
import {
  dehydratePrefetched,
  getPortalCaller,
} from "@/lib/portal-bootstrap.server";
import type { PortalCaller, Prefetch } from "@/lib/portal-bootstrap.server";

/**
 * Runs a page's first tRPC reads on the server and hands the results to the
 * client page's react-query cache, so its content ships with the HTML instead
 * of after hydration plus a fetch. The client page is unchanged: its useQuery
 * calls find the data already in the cache. With no session it renders the
 * page as-is and the page redirects or signs in as it always did.
 */
export async function PrefetchedPage({
  reads,
  children,
}: {
  reads: (caller: PortalCaller) => readonly Prefetch[];
  children: React.ReactNode;
}) {
  const signedIn = await getPortalCaller();
  if (!signedIn) return children;
  return (
    <HydrationBoundary state={await dehydratePrefetched(reads(signedIn.caller))}>
      {children}
    </HydrationBoundary>
  );
}
