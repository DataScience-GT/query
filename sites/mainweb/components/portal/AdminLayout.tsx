"use client";

import { useSession } from "next-auth/react";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const { data: adminStatus, isLoading: adminLoading } =
    trpc.admin.isAdmin.useQuery(undefined, {
      enabled: status === "authenticated",
    });

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    } else if (status === "authenticated" && !adminLoading) {
      if (!adminStatus?.isAdmin) {
        router.push("/dashboard");
      } else {
        setLoading(false);
      }
    }
  }, [status, adminStatus, adminLoading, router]);

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
