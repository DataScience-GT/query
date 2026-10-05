"use client";

import { useEffect } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { canViewAdmin, usePortalContext } from "@/lib/use-portal-context";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const router = useRouter();

  const { data: portalContext, isLoading: portalLoading } = usePortalContext();

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = loginHref();
    } else if (status === "authenticated" && !portalLoading) {
      if (!canViewAdmin(portalContext)) {
        router.push("/dashboard");
      }
    }
  }, [status, portalContext, portalLoading, router]);

  const loading = !(
    status === "authenticated" &&
    !portalLoading &&
    canViewAdmin(portalContext)
  );

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[var(--bg-primary)]">
        <div className="flex items-center justify-center h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)] font-sans selection:bg-accent/30 overflow-x-hidden flex flex-col md:flex-row">
      <div className="flex-1 transition-ui duration-300 w-full">
        {portalContext?.isBugTester && (
          <div
            role="status"
            className="border-b border-[var(--warning)]/40 bg-[var(--warning-glow)] px-4 py-2.5 text-[13px] text-[var(--text-primary)] md:px-6"
          >
            <span className="font-semibold">Read-only QA access.</span> You can
            open every admin page; saving, deleting and other changes are
            blocked.
          </div>
        )}
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
