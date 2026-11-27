"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginHref } from "@/lib/safe-callback";

/** Sends a signed-out visitor to the login page, then back here afterwards. */
export function useLoginRedirect(status: string) {
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);
}
