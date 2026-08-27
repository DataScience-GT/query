"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePortalContext } from "@/lib/use-portal-context";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

/**
 * Volunteers are not admins, so both check-in desks live outside /admin.
 * Club scanning and hackathon scanning are separate pages — mixing them on
 * one screen put club meetings inside the hackathon desk.
 */
export function ScanAccess({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const { data: portalContext, isLoading } = usePortalContext();

  if (status === "loading" || isLoading) {
    return <LoadingScreen message="Checking access…" />;
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  if (!portalContext?.isScanner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <LiquidGlass className="p-12 max-w-md text-center">
          <h1 className="text-2xl font-black text-[var(--text-primary)] mb-4 uppercase tracking-tight">
            Not a Scanner
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-mono mb-8">
            This is the event check-in desk. Ask an organiser to add you as
            event staff.
          </p>
          <Link
            href="/dashboard"
            className="px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
          >
            Back to Dashboard
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  return <>{children}</>;
}
