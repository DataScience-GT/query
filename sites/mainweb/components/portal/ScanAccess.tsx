"use client";

import { useSession } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { usePortalContext } from "@/lib/use-portal-context";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { body, sectionTitle, textLink } from "@/components/portal/ui";

/**
 * Volunteers are not admins, so both check-in desks live outside /admin.
 * Club scanning and hackathon scanning are separate pages — mixing them on
 * one screen put club meetings inside the hackathon desk.
 */
export function ScanAccess({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const { data: portalContext, isLoading } = usePortalContext();

  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);

  if (status === "loading" || isLoading) {
    return <LoadingScreen message="Checking access…" />;
  }

  if (status === "unauthenticated") {
    // The effect above navigates; pushing during render fired it repeatedly.
    return null;
  }

  if (!portalContext?.isScanner) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <h1 className={sectionTitle}>You&apos;re not on event staff</h1>
          <p className={`${body} mt-3`}>
            This is the event check-in desk. Ask an organiser to add you as
            event staff.
          </p>
          <Link href="/dashboard" className={`${textLink} mt-6`}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
