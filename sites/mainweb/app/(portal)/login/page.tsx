"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn, getProviders } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePortalContext } from "@/lib/use-portal-context";
import { safeCallback } from "@/lib/safe-callback";
import { useIsClient } from "@/lib/use-is-client";
import {
  body,
  btnInk,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  kicker,
  pageDek,
  pageTitle,
  sectionTitle,
} from "@/components/portal/ui";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallback(searchParams.get("callbackUrl"));
  const mounted = useIsClient();
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
          "We couldn't send a code to that address. Check it and try again.",
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
      setEmailError("We couldn't send the code. Try again.");
    }
  };

  const handleSignIn = () => {
    signIn("google", { callbackUrl: callbackUrl ?? "/dashboard" });
  };

  const handleGithubSignIn = () => {
    signIn("github", { callbackUrl: callbackUrl ?? "/dashboard" });
  };

  if (!mounted) return <div className="min-h-screen" />;

  const isRedirecting = !!session;
  const busy = emailSending || isRedirecting || status === "loading";

  return (
    <main className="min-h-screen flex items-center px-5 sm:px-8 md:px-12">
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 py-14 items-center">
        <div>
          <img
            src="/images/dsgt/apple-touch-icon.png"
            alt="DSGT Logo"
            className="w-14 h-14 lg:w-16 lg:h-16 object-contain"
          />
          <p className={`mt-8 ${kicker}`}>DS@GT</p>
          <h1 className={`mt-2 ${pageTitle}`}>
            Query<span className="text-accent">.</span>
          </h1>
          <p className={pageDek}>
            The member portal for Data Science at Georgia Tech: events,
            hackathons, and your membership in one place.
          </p>
        </div>

        <div className="w-full max-w-md lg:justify-self-end border-t border-[var(--border-subtle)] pt-8 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-12">
          <h2 className={sectionTitle}>Sign in</h2>
          <p className={`mt-2 ${body}`}>
            {isRedirecting
              ? "You're signed in. Taking you to the portal…"
              : "Use your Google or GitHub account, or get a code by email."}
          </p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={busy}
              className={`w-full ${btnPrimary}`}
            >
              {isRedirecting ? "Signed in" : "Continue with Google"}
            </button>

            {hasProvider("github") && (
              <button
                type="button"
                onClick={handleGithubSignIn}
                disabled={busy}
                className={`w-full ${btnSecondary}`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="w-4 h-4 fill-current"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                Continue with GitHub
              </button>
            )}

            {!showEmailInput ? (
              <button
                onClick={() => {
                  setShowEmailInput(true);
                }}
                disabled={busy}
                className={`w-full ${btnSecondary}`}
              >
                Email me a code
              </button>
            ) : (
              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <label htmlFor="login-email" className={fieldLabel}>
                  Email
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
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
                    aria-label="Email address"
                    disabled={emailSending || emailSent}
                    className={`min-w-0 flex-1 ${input}`}
                  />
                  <button
                    onClick={handleEmailLogin}
                    disabled={emailSending || emailSent || !email}
                    className={btnInk}
                  >
                    {emailSent ? "Sent" : emailSending ? "Sending…" : "Send code"}
                  </button>
                </div>
                {emailError && (
                  <p className="mt-2 text-[13px] text-[var(--danger)]">
                    {emailError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
