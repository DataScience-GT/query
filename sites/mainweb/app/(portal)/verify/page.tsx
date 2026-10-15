"use client";

import React, { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  btnPrimary,
  mastRule,
  pageDek,
  pageTitle,
  textLink,
} from "@/components/portal/ui";
import { safeCallback } from "@/lib/safe-callback";

/**
 * The server sends one code per address per minute and silently drops a repeat
 * inside it (packages/auth/src/config.ts), so a resend any sooner would show
 * "sent" and deliver nothing. The count starts when this page loads, which is
 * after the first send.
 */
const RESEND_COOLDOWN_SECONDS = 60;

function VerifyContent() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  // Bumped by every resend, which restarts the cooldown.
  const [sends, setSends] = useState(0);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const email = searchParams?.get("email") || "";
  const callbackUrl = safeCallback(searchParams?.get("callbackUrl"));
  // Back to sign-in keeps the destination, or a hacker who mistyped the
  // address would come back to the member copy and land on /dashboard.
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Counted against the clock, not by ticks: a phone pauses timers while the
  // visitor is off in their mail app, and a tick count would still be waiting
  // when they come back for a new code.
  useEffect(() => {
    const until = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setCooldown(left);
      if (left === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [sends]);

  const handleChange = (index: number, value: string) => {
    // iOS AutoFill puts the whole code into the focused box in one change, so a
    // full code is taken as it is and anything else keeps its last digit.
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "");
      if (digits.length === 6) {
        setCode(digits.split(""));
        setError("");
        handleSubmit(digits);
        return;
      }
      value = digits.slice(-1);
    }

    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError("");

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (value && index === 5 && newCode.every((d) => d !== "")) {
      handleSubmit(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") {
      const fullCode = code.join("");
      if (fullCode.length === 6) {
        handleSubmit(fullCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasted.length === 0) return;

    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || "";
    }
    setCode(newCode);

    // Focus the next empty input or the last one
    const nextEmpty = newCode.findIndex((d) => d === "");
    inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();

    // Auto-submit if all 6 digits pasted
    if (pasted.length === 6) {
      handleSubmit(pasted);
    }
  };

  const handleSubmit = async (fullCode: string) => {
    if (verifying) return;
    setVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: fullCode, email }),
      });

      const data = await res.json();

      if (data.success) {
        // Redirect — session cookie is set by the API.
        //
        // The caller's destination wins. `data.redirectUrl` is hardcoded to
        // /dashboard by the route, so the `||` below can never fall through to
        // anything else — reading the query param first is what actually
        // returns somebody to the page that sent them here.
        window.location.assign(
          callbackUrl || data.redirectUrl || "/dashboard",
        );
      } else {
        setError(
          data.error ||
            "That code didn't match. Check the newest email, or resend.",
        );
        setVerifying(false);
        // Clear code and refocus
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError(
        "We couldn't check the code. Check your connection and try again.",
      );
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setResent(false);
    setError("");

    try {
      // The same call the login page makes, so the address and destination
      // match the first send. redirect:false resolves with a result instead of
      // throwing, so a failed send is read off it.
      const res = await signIn("nodemailer", {
        email,
        callbackUrl: callbackUrl ?? "/dashboard",
        redirect: false,
      });

      if (!res?.ok || res.error) {
        setError("We couldn't send a new code. Try again.");
      } else {
        // A new code replaces the last one, so the boxes start over.
        setResent(true);
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setSends((n) => n + 1);
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("We couldn't send a new code. Try again.");
    }
    setResending(false);
  };

  return (
    <main className="min-h-screen flex items-start md:items-center px-5 sm:px-8">
      <div className="mx-auto w-full max-w-lg py-10 md:py-16">
        <div className={`flex items-center gap-3 ${mastRule}`}>
          <img
            src="/images/dsgt/apple-touch-icon.png"
            alt=""
            className="h-8 w-8 shrink-0 object-contain"
          />
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
            DS@GT
          </p>
        </div>
        <h1 className={`mt-10 ${pageTitle}`}>Check your email</h1>
        {email ? (
          <p className={pageDek}>
            We sent a 6-digit code to
            <span className="block font-semibold text-[var(--text-primary)] wrap-anywhere">
              {email}
            </span>
          </p>
        ) : (
          <p className={pageDek}>
            We don&apos;t know which address the code went to. Go back to sign
            in and request a new one.
          </p>
        )}

        {/* 6-digit code input */}
        <div className="mt-8 flex gap-2 sm:gap-3" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              // Six boxes with no labels read as six unnamed fields. The first
              // also takes the pasted code, which is how most people enter it.
              aria-label={`Verification code, digit ${i + 1} of ${code.length}`}
              // Only the first box takes a whole code (iOS AutoFill, see
              // handleChange); the rest hold a single digit.
              maxLength={i === 0 ? undefined : 1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={verifying}
              className={`h-14 min-w-0 flex-1 sm:h-16 sm:w-12 sm:flex-none rounded-[var(--radius-sm)] border bg-[var(--bg-input)] text-center font-mono text-2xl font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                i === 3 ? "ml-2 sm:ml-3" : ""
              } ${
                error
                  ? "border-[var(--danger)] focus:ring-[var(--danger-glow)]"
                  : "border-[var(--border-medium)] focus:border-accent focus:ring-[var(--accent-dim)]"
              }`}
              autoComplete={i === 0 ? "one-time-code" : "off"}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[15px] text-[var(--danger)]">
            {error}
          </p>
        )}

        {/* Stays enabled: on an incomplete code it moves to the first empty box
            instead of sitting there greyed out with no reason. */}
        <button
          onClick={() => {
            const i = code.findIndex((d) => d === "");
            if (i !== -1) {
              inputRefs.current[i]?.focus();
              return;
            }
            handleSubmit(code.join(""));
          }}
          disabled={verifying}
          className={`mt-6 min-h-11 w-full sm:w-auto ${btnPrimary}`}
        >
          {verifying ? "Verifying…" : "Verify code"}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-6">
          {email &&
            (cooldown > 0 ? (
              <p className="text-sm text-[var(--text-muted)] tabular-nums">
                Resend code in {cooldown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={verifying || resending}
                className={`${textLink} min-h-11`}
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            ))}
          <Link href={loginHref} className={`${textLink} min-h-11`}>
            {email ? "Use a different email" : "Back to sign in"}
          </Link>
        </div>
        {resent && (
          <p
            role="status"
            className="mt-1 text-[15px] text-[var(--text-muted)]"
          >
            New code sent. The last one no longer works.
          </p>
        )}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <VerifyContent />
    </Suspense>
  );
}
