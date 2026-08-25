"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn, getProviders } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePortalContext } from "@/lib/use-portal-context";
import { safeCallback } from "@/lib/safe-callback";
import Link from "next/link";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallback(searchParams.get("callbackUrl"));
  const [mounted, setMounted] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const { data: portalContext } = usePortalContext();

  /**
   * Which providers the server actually registered.
   *
   * GitHub is only added to the provider list when GITHUB_CLIENT_ID and
   * GITHUB_CLIENT_SECRET are set (packages/auth/src/config.ts), so a
   * deployment without them was rendering a GitHub button that called
   * signIn("github") against a provider that did not exist — a dead button
   * with no explanation. Asking the server what it supports means a missing
   * provider hides its button instead of failing when pressed.
   */
  const [providers, setProviders] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
    getProviders()
      .then((p) => setProviders(p ?? {}))
      // A failed lookup must not hide every sign-in button. Falling back to
      // "assume configured" keeps the page usable and lets the provider's own
      // error surface instead.
      .catch(() => setProviders(null));
  }, []);

  // null means "we could not ask" — show it and let signIn report the truth.
  const hasProvider = (id: string) => providers === null || id in providers;

  useEffect(() => {
    if (session) {
      const redirectTimeout = setTimeout(() => {
        // An explicit destination wins over the role default: somebody sent
        // here by a page that asked them to sign in wants to land back on it,
        // not on a dashboard that says nothing about why they signed in.
        if (callbackUrl) {
          router.push(callbackUrl);
        } else if (portalContext?.isJudge && !portalContext?.isAdmin) {
          router.push("/judge");
        } else {
          router.push("/dashboard");
        }
      }, 1500);

      return () => clearTimeout(redirectTimeout);
    }
  }, [
    status,
    session,
    router,
    callbackUrl,
    portalContext?.isJudge,
    portalContext?.isAdmin,
  ]);

  const handleEmailLogin = async () => {
    if (!email) return;
    setEmailSending(true);
    try {
      // redirect:false resolves with a result instead of throwing, so a failed
      // send has to be read off the result or every failure looks like a send.
      const res = await signIn("nodemailer", {
        email,
        callbackUrl: callbackUrl ?? "/dashboard",
        redirect: false,
      });

      if (!res?.ok || res.error) {
        setEmailSending(false);
        setEmailError(
          "We could not send that link. Check the address and try again.",
        );
        return;
      }

      setEmailSent(true);
      // The destination has to ride along to /verify. The code flow finishes on
      // that screen, not through NextAuth's own redirect, so dropping it here
      // is what sent everybody to /dashboard no matter where they came from.
      const next = callbackUrl
        ? `&callbackUrl=${encodeURIComponent(callbackUrl)}`
        : "";
      router.push(`/verify?email=${encodeURIComponent(email)}${next}`);
    } catch {
      setEmailSending(false);
      setEmailError("We could not send that link. Please try again.");
    }
  };

  const handleSignIn = () => {
    signIn("google", { callbackUrl: callbackUrl ?? "/dashboard" });
  };

  const handleGithubSignIn = () => {
    signIn("github", { callbackUrl: callbackUrl ?? "/dashboard" });
  };

  if (!mounted)
    return <div className="min-h-screen bg-[var(--bg-primary)]" />;

  const isRedirecting = !!session;
  const busy = emailSending || isRedirecting || status === "loading";

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)] font-sans selection:bg-accent/30 flex flex-col">
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-16 w-full">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-3">
            <p className="page-kicker">Member portal</p>
            <h1 className="page-title text-4xl md:text-5xl">Sign in</h1>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Use the account you joined with. Google is the usual path; email
              sends a one-time code.
            </p>
          </div>

          {isRedirecting && (
            <p className="text-sm text-accent">You&apos;re signed in. Taking you in…</p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={busy}
              className="btn-solid w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRedirecting ? "Signed in" : "Sign in with Google"}
            </button>

            {hasProvider("github") && (
              <button
                type="button"
                onClick={handleGithubSignIn}
                disabled={busy}
                className="btn-line w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sign in with GitHub
              </button>
            )}

            {!showEmailInput ? (
              <button
                type="button"
                onClick={() => setShowEmailInput(true)}
                disabled={busy}
                className="w-full min-h-11 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-ui disabled:opacity-40"
              >
                Use email instead
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="login-email" className="text-sm text-[var(--text-muted)]">
                  Email
                </label>
                <div className="flex gap-2">
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                    placeholder="you@gatech.edu"
                    disabled={emailSending || emailSent}
                    className="flex-1 px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm placeholder:text-gray-600 disabled:opacity-30"
                  />
                  <button
                    type="button"
                    onClick={handleEmailLogin}
                    disabled={emailSending || emailSent || !email}
                    className="btn-line shrink-0 disabled:opacity-30"
                  >
                    {emailSent ? "Sent" : emailSending ? "Sending…" : "Send code"}
                  </button>
                </div>
                {emailError && (
                  <p className="text-red-400 text-sm">{emailError}</p>
                )}
              </div>
            )}
          </div>

          <p className="text-sm">
            <Link href="/" className="link-measure">
              Back to the club site
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
