"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { usePortalContext } from "@/lib/use-portal-context";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const { data: portalContext, isLoading: portalLoading } = usePortalContext();

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    } else if (status === "authenticated" && !portalLoading) {
      if (!portalContext?.isAdmin) {
        router.push("/dashboard");
      } else {
        setLoading(false);
      }
    }
  }, [status, portalContext?.isAdmin, portalLoading, router]);

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[var(--bg-primary)]">
        <div className="flex items-center justify-center h-screen">
          <div className="h-8 w-8 animate-spin rounded-sm border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] dark:bg-darkBlue/80 text-[var(--text-muted)] font-sans selection:bg-accent/30 overflow-x-hidden flex flex-col md:flex-row">
      <div className="flex-1 transition-all duration-300 w-full">
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
