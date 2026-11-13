"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn, getProviders } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Alert } from "@query/ui/Alert";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
} from "@query/ui/classes";

/**
 * The sign-in buttons and the email-code form, the only part of the login page
 * that needs the browser. The page around it renders on the server, which also
 * sends a signed-in visitor straight on. This island only has to notice a
 * session that appears while the page is open, such as a sign-in finished in
 * another tab.
 */
export default function LoginActions({
  callbackUrl,
  forHackers,
  inAppBrowser,
}: {
  callbackUrl: string | null;
  forHackers: boolean;
  inAppBrowser: boolean;
}) {
  const { status } = useSession();
  const router = useRouter();
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const emailInputRef = useRef<HTMLInputElement>(null);

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

  // A redirect to this page, such as /docs sending a signed-out visitor here,
  // arrives with the fragment of the page it left. It goes back on the
  // destination, or sign-in would land on the top of /docs, not #api.
  const destination = () =>
    callbackUrl && !callbackUrl.includes("#")
      ? callbackUrl + window.location.hash
      : callbackUrl;

  const isRedirecting = status === "authenticated";

  useEffect(() => {
    // The server owns where a signed-in visitor goes (the callback, else the
    // role's home), so ask it again now that there is a session.
    if (isRedirecting) router.refresh();
  }, [isRedirecting, router]);

  const handleEmailLogin = async () => {
    // The button stays enabled, so an empty field says what is missing instead
    // of showing a greyed-out control with no reason.
    if (!email) {
      setEmailError("Enter your email address.");
      emailInputRef.current?.focus();
      return;
    }
    setEmailSending(true);
    try {
      // redirect:false resolves with a result instead of throwing, so a failed
      // send has to be read off the result or every failure looks like a send.
      const res = await signIn("nodemailer", {
        email,
        callbackUrl: destination() ?? "/dashboard",
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
      const to = destination();
      const next = to
        ? `&callbackUrl=${encodeURIComponent(to)}`
        : "";
      router.push(`/verify?email=${encodeURIComponent(email)}${next}`);
    } catch {
      setEmailSending(false);
      setEmailError("We couldn't send the code. Try again.");
    }
  };

  const handleSignIn = () => {
    signIn("google", { callbackUrl: destination() ?? "/dashboard" });
  };

  const handleGithubSignIn = () => {
    signIn("github", { callbackUrl: destination() ?? "/dashboard" });
  };

  const busy = emailSending || isRedirecting;

  // Shown first in an in-app browser, where Google cannot work, and in place of
  // the "Email me a code" button once that is pressed everywhere else.
  const emailForm = (
    <div className={inAppBrowser ? undefined : "pt-3"}>
      <label htmlFor="login-email" className={fieldLabel}>
        Email
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          ref={emailInputRef}
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
          placeholder={forHackers ? "you@school.edu" : "you@gatech.edu"}
          aria-label="Email address"
          disabled={emailSending || emailSent || isRedirecting}
          className={`min-w-0 flex-1 ${input}`}
        />
        <button
          onClick={handleEmailLogin}
          disabled={emailSending || emailSent || isRedirecting}
          className={`min-h-11 ${btnPrimary}`}
        >
          {emailSent ? "Sent" : emailSending ? "Sending…" : "Send code"}
        </button>
      </div>
      {emailError && (
        <Alert size={13} className="mt-2">
          {emailError}
        </Alert>
      )}
    </div>
  );

  return (
    <div
      role="group"
      aria-label="Sign in"
      className="w-full max-w-md lg:justify-self-end lg:border-l lg:border-[var(--border-subtle)] lg:pl-12"
    >
      {isRedirecting && (
        <p role="status" className={`mb-5 ${body}`}>
          You&apos;re signed in. Taking you to the portal…
        </p>
      )}
      {inAppBrowser && !isRedirecting && (
        <p
          role="note"
          className="mb-5 text-[15px] leading-relaxed text-[var(--text-primary)]"
        >
          Google sign-in is blocked in this app&apos;s browser. Get a code by
          email, or open this page in Safari or Chrome.
        </p>
      )}

      <div className="space-y-3">
        {inAppBrowser && emailForm}

        {!inAppBrowser && (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={busy}
            className={`min-h-11 w-full ${showEmailInput ? btnSecondary : btnPrimary}`}
          >
            {isRedirecting ? "Signed in" : "Continue with Google"}
          </button>
        )}

        {hasProvider("github") && (
          <button
            type="button"
            onClick={handleGithubSignIn}
            disabled={busy}
            className={`min-h-11 w-full ${btnSecondary}`}
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

        {!inAppBrowser &&
          (showEmailInput ? (
            emailForm
          ) : (
            <button
              onClick={() => {
                setShowEmailInput(true);
              }}
              disabled={busy}
              className={`min-h-11 w-full ${btnSecondary}`}
            >
              Email me a code
            </button>
          ))}
      </div>
    </div>
  );
}
