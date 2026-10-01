"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn, getProviders } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePortalContext } from "@/lib/use-portal-context";
import { safeCallback } from "@/lib/safe-callback";
import { useIsClient } from "@/lib/use-is-client";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

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

  if (!mounted) return <div className="min-h-screen bg-[var(--bg-tertiary)]" />;

  const isRedirecting = !!session;
  const busy = emailSending || isRedirecting || status === "loading";

  const btnPrimary =
    "w-full flex items-center justify-center gap-2 px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50 disabled:cursor-not-allowed";
  const btnSecondary =
    "w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10 min-h-screen flex items-center">
        <div className="grid w-full grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="space-y-4">
            <img
              src="/images/dsgt/apple-touch-icon.png"
              alt="DSGT Logo"
              className="w-16 h-16 lg:w-24 lg:h-24 object-contain"
            />
            <div>
              <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2">
                DS@GT
              </p>
              <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
                Query
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md">
                The member portal for Data Science at Georgia Tech: events,
                hackathons, and your membership in one place.
              </p>
            </div>
          </div>

          <LiquidGlass printed className="p-6 w-full max-w-md lg:justify-self-end">
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
              Sign in
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {isRedirecting
                ? "You're signed in. Taking you to the portal…"
                : "Use your Google or GitHub account, or get a code by email."}
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={busy}
                className={btnPrimary}
              >
                {isRedirecting ? "Signed in" : "Continue with Google"}
              </button>

              {hasProvider("github") && (
                <button
                  type="button"
                  onClick={handleGithubSignIn}
                  disabled={busy}
                  className={btnSecondary}
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
                  className={btnSecondary}
                >
                  Email me a code
                </button>
              ) : (
                <div className="pt-3 border-t border-[var(--border-subtle)]">
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                  >
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
                      className="w-full min-w-0 flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui disabled:opacity-50"
                    />
                    <button
                      onClick={handleEmailLogin}
                      disabled={emailSending || emailSent || !email}
                      className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {emailSent ? "Sent" : emailSending ? "Sending…" : "Send code"}
                    </button>
                  </div>
                  {emailError && (
                    <p className="mt-2 text-sm text-rose-400">{emailError}</p>
                  )}
                </div>
              )}
            </div>
          </LiquidGlass>
        </div>
      </main>
    </div>
  );
}
