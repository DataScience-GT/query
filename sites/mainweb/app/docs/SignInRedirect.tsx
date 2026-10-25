"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginHref } from "@/lib/safe-callback";

/**
 * Sends a signed-out visitor to sign in. Done in the browser, not with a
 * server redirect, because only the browser sees the hash: /docs#api has to
 * come back to the API section after sign-in.
 */
export default function SignInRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(loginHref());
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505] font-mono text-gray-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00A8A8] border-t-transparent" />
      <p className="text-xs tracking-[0.3em] uppercase">Checking sign-in</p>
    </div>
  );
}
