"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams ? searchParams.get("error") : null;

  const errorMessages: Record<string, { title: string; desc: string }> = {
    Configuration: {
      title: "Configuration_Error",
      desc: "There is a problem with the server configuration. Check NEXTAUTH_URL and NEXTAUTH_SECRET.",
    },
    AccessDenied: {
      title: "Access_Denied",
      desc: "You do not have permission to sign in. Your account may not be authorized.",
    },
    Verification: {
      title: "Verification_Failed",
      desc: "The sign-in link is no longer valid or has already been used.",
    },
    Default: {
      title: "Authentication_Failure",
      desc: "An unexpected error occurred during the authentication process.",
    },
  };

  const { title, desc } =
    (error && errorMessages[error]) || errorMessages.Default;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex flex-col items-center justify-center px-6 text-center">
      <div className="relative z-10 w-24 h-24 rounded-sm bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
        <svg
          className="w-12 h-12 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <div className="relative z-10 space-y-4 mb-12 max-w-lg">
        <h1 className="text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter italic">
          Auth_<span className="text-red-500">Error</span>
        </h1>
        <p className="text-xs font-mono text-text-muted uppercase tracking-[0.4em] mb-4">
          Status_Code: 401 // Type: {error || "Unknown"}
        </p>
        <div className="h-[1px] w-12 bg-red-500/30 mx-auto transition-ui group-hover:w-24" />
        <h2 className="text-xl font-bold text-gray-200 uppercase">{title}</h2>
        <p className="text-text-muted font-mono text-sm leading-relaxed lowercase">
          &gt; {desc}
        </p>
      </div>

      <div className="relative z-10 flex gap-4">
        <Link
          href="/login"
          className="px-10 py-4 bg-white/[0.03] border border-[var(--border-subtle)] text-[var(--text-primary)] font-black text-xs uppercase tracking-[0.3em] hover:bg-white/10 hover:border-white/20 transition-ui rounded-none shadow-lg font-mono"
        >
          &lt; Return_To_Base
        </Link>
      </div>

      <div className="fixed bottom-12 left-0 w-full text-center">
        <p className="text-[10px] text-gray-700 font-mono uppercase tracking-[0.5em]">
          Query_Security_Protocols_Active
        </p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center font-mono text-red-500 uppercase tracking-widest">
          Loading_Error_Log...
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
