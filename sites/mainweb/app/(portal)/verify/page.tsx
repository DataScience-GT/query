"use client";

import React, { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
        window.location.href =
          callbackUrl || data.redirectUrl || "/dashboard";
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
    <div className="relative min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3">
          <p className="page-kicker">Email sign-in</p>
          <h1 className="page-title text-4xl">Enter your code</h1>
          <p className="text-[var(--text-muted)] leading-relaxed">
            We sent a 6-digit code
            {email ? ` to ${email}` : ""}. It expires after a few minutes.
          </p>
        </div>

        <div className="flex gap-2" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              aria-label={`Verification code, digit ${i + 1} of ${code.length}`}
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={verifying}
              className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-xl font-mono bg-[var(--bg-secondary)] border text-[var(--text-primary)] ${
                error
                  ? "border-red-500/50 text-red-400"
                  : digit
                    ? "border-accent/50"
                    : "border-[var(--border-subtle)]"
              } ${verifying ? "opacity-50 cursor-not-allowed" : ""}`}
              autoComplete={i === 0 ? "one-time-code" : "off"}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-sm" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => handleSubmit(code.join(""))}
          disabled={verifying || code.some((d) => d === "")}
          className="btn-solid w-full disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {verifying ? "Checking…" : "Verify code"}
        </button>

        {!email && (
          <p className="text-sm text-[var(--text-muted)]">
            No email on this page.{" "}
            <Link href="/login" className="link-measure">
              Go back to sign in
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-muted)]">
          Loading
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
