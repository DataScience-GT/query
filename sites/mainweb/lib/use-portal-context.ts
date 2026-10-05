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

/** Tooltip for write controls a bug tester sees disabled. */
export const READ_ONLY_TITLE =
  "Read-only access: bug testers can't make changes.";

/**
 * True for a bug tester on the admin side. Write controls render disabled
 * with READ_ONLY_TITLE; the API refuses the write either way, this only keeps
 * the page honest about it.
 */
export function useReadOnly() {
  const { data } = usePortalContext();
  return !!data?.isBugTester && !data?.isAdmin;
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
