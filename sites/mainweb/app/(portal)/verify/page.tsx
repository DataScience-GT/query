"use client";

import React, { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  btnPrimary,
  kicker,
  pageDek,
  pageTitle,
  textLink,
} from "@/components/portal/ui";
import { safeCallback } from "@/lib/safe-callback";

function VerifyContent() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const email = searchParams?.get("email") || "";
  const callbackUrl = safeCallback(searchParams?.get("callbackUrl"));

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
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
        setError(data.error || "Invalid code. Please try again.");
        setVerifying(false);
        // Clear code and refocus
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setVerifying(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center px-5 sm:px-8">
      <div className="mx-auto w-full max-w-lg py-16">
        <p className={kicker}>Sign-in</p>
        <h1 className={`mt-2 ${pageTitle}`}>Check your email for a code</h1>
        {email ? (
          <p className={pageDek}>
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-[var(--text-primary)] break-all">
              {email}
            </span>
            .
          </p>
        ) : (
          <p className={pageDek}>
            We don&apos;t know which address the code went to. Go back to sign
            in and request a new one.
          </p>
        )}

        {/* 6-digit code input */}
        <div className="mt-10 flex gap-2 sm:gap-3" onPaste={handlePaste}>
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
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={verifying}
              className={`w-11 h-14 sm:w-12 sm:h-16 rounded-[var(--radius-sm)] border bg-[var(--bg-input)] text-center font-mono text-2xl font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                error
                  ? "border-[var(--danger)] focus:ring-[var(--danger-glow)]"
                  : "border-[var(--border-medium)] focus:border-accent focus:ring-[var(--accent-dim)]"
              }`}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[15px] text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-6">
          <button
            onClick={() => handleSubmit(code.join(""))}
            disabled={verifying || code.some((d) => d === "")}
            className={btnPrimary}
          >
            {verifying ? "Verifying…" : "Verify code"}
          </button>
          <Link href="/login" className={textLink}>
            {email ? "Use a different email" : "Back to sign in"}
          </Link>
        </div>
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
