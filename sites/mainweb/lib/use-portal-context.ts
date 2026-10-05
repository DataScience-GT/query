"use client";

import { useSession } from "next-auth/react";
import type { PortalContext } from "@query/api";
import { trpc } from "@/lib/trpc";
import { portalContextQueryOptions } from "@/lib/query-client";

export type { PortalContext };

export function usePortalContext() {
  const { data: session, status } = useSession();

  return trpc.user.getPortalContext.useQuery(undefined, {
    ...portalContextQueryOptions,
    enabled: status === "authenticated" && !!session,
  });
}

/** Call after mutations that change admin, judge, or member status. */
export function useInvalidatePortalContext() {
  const utils = trpc.useUtils();
  return () => utils.user.getPortalContext.invalidate();
}

/**
 * Who may open the admin pages: staff, plus read-only bug testers. Writes are
 * refused by the API for bug testers, so this only decides what renders.
 */
export function canViewAdmin(ctx: PortalContext | undefined | null) {
  return !!ctx?.isAdmin || !!ctx?.isBugTester;
}

export function useIsAdmin() {
  const { data } = usePortalContext();
  return data?.isAdmin ?? false;
}

export function useIsMember() {
  const { data } = usePortalContext();
  return data?.member.isMember ?? false;
}

export function useIsJudge() {
  const { data } = usePortalContext();
  return data?.isJudge ?? false;
}
