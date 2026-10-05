"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { btnPrimary, kicker, pageDek, pageTitle } from "@/components/portal/ui";
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
    <main className="min-h-screen flex items-center px-5 sm:px-8">
      <div className="mx-auto w-full max-w-lg py-16">
        <p className={kicker}>Sign-in</p>
        <h1 className={`mt-2 ${pageTitle}`}>{title}</h1>
        <p className={pageDek}>{desc}</p>
        <div className="mt-8">
          <Link href="/login" className={btnPrimary}>
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthErrorContent />
    </Suspense>
  );
}
