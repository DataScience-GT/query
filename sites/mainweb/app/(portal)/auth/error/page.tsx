"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams ? searchParams.get("error") : null;

  const errorMessages: Record<string, { title: string; desc: string }> = {
    Configuration: {
      title: "Sign-in is unavailable",
      desc: "Sign-in is unavailable right now. Please try again later.",
    },
    AccessDenied: {
      title: "Access denied",
      desc: "You do not have permission to sign in.",
    },
    Verification: {
      title: "Link expired",
      desc: "The sign-in link is no longer valid or has already been used.",
    },
    Default: {
      title: "Sign-in failed",
      desc: "We couldn't sign you in. Try again, or use a different sign-in method.",
    },
  };

  const { title, desc } =
    (error && errorMessages[error]) || errorMessages.Default;

  return (
    <div className="min-h-screen bg-[var(--bg-tertiary)] flex flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-6" />

      <div className="max-w-lg mb-8">
        <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
          {title}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">{desc}</p>
      </div>

      <Link
        href="/login"
        className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthErrorContent />
    </Suspense>
  );
}
