"use client";

import React, { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

function VerifyContent() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const email = searchParams?.get("email") || "";

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
        // Redirect — session cookie is set by the API
        window.location.href = data.redirectUrl || "/dashboard";
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
    <div className="relative min-h-screen bg-[var(--bg-secondary)] flex flex-col items-center justify-center px-6 text-center overflow-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-gradient-to-r from-accent/5 via-emerald-900/10 to-purple-900/8 blur-[400px] rounded-sm" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-emerald-900/10 via-emerald-900/10 to-indigo-900/8 blur-[350px] rounded-sm" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.02)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      <LiquidGlass className="relative z-10 w-full max-w-lg p-10 md:p-14 flex flex-col items-center relative overflow-hidden">
        {/* Decorative corner accents */}
        <div className="absolute top-4 right-4 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <svg
            className="w-32 h-32 text-[var(--text-primary)]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
          </svg>
        </div>
        <div className="absolute bottom-4 left-4 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <svg
            className="w-28 h-28 text-[var(--text-primary)]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
          </svg>
        </div>

        <div className="relative w-24 h-24 rounded-sm bg-gradient-to-br from-accent/15 to-accent/10 border border-accent/30 flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(16,185,129,0.15)] group hover:border-accent/50 hover:shadow-[0_0_50px_rgba(16,185,129,0.25)] transition-all duration-300">
          {/* Icon glow */}
          <div className="absolute inset-0 rounded-sm bg-accent/20 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
          <svg
            className="relative w-12 h-12 text-accent group-hover:text-[var(--text-primary)] transition-colors duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <div className="space-y-4 mb-10 text-center flex flex-col items-center relative">
          <h1 className="text-5xl font-black text-[var(--text-primary)] uppercase tracking-tighter italic relative">
            Enter
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-emerald-400 to-accent relative z-10">
              Code
            </span>
            {/* Animated underline */}
            <div className="absolute -bottom-3 left-0 right-0 h-[3px] bg-gradient-to-r from-accent/0 via-accent/100 to-accent/0 blur-[2px]" />
          </h1>
          <p className="text-xs font-mono text-text-muted uppercase tracking-[0.4em] mb-2">
            Code Verification
          </p>
          <div className="h-[1px] w-16 bg-gradient-to-r from-accent/40 via-accent/70 to-accent/40 mx-auto" />
          <p className="text-text-muted font-mono text-sm leading-relaxed mt-4">
            We sent a 6-digit access code to your terminal.
          </p>
          {email && (
            <p className="text-accent/80 font-mono text-xs flex items-center justify-center gap-2">
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              {email}
            </p>
          )}
          {/* Decorative particles */}
          <div className="absolute top-2 right-10 w-1 h-1 rounded-sm bg-accent/40 animate-pulse" />
          <div className="absolute bottom-8 left-10 w-1 h-1 rounded-sm bg-accent/40 animate-pulse delay-75" />
          <div className="absolute top-8 left-12 w-1 h-1 rounded-sm bg-emerald-500/40 animate-pulse delay-150" />
        </div>

        {/* 6-digit code input - Enhanced */}
        <div
          className="flex gap-2 sm:gap-3 mb-8 relative"
          onPaste={handlePaste}
        >
          {/* Background decorative elements */}
          <div className="absolute -inset-x-4 top-1/2 -translate-y-1/2 h-[calc(100%-1rem)] w-full bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-sm" />
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={verifying}
              className={`
                                w-12 h-14 sm:w-14 sm:h-18 text-center text-xl sm:text-2xl font-mono font-black
                                bg-[var(--bg-primary)]/40 border-[1.5px] rounded-none
                                text-[var(--text-primary)] focus:outline-none transition-all duration-300
                                ${
                                  error
                                    ? "border-red-500/50 focus:border-red-500 focus:bg-red-500/5 text-red-500"
                                    : digit
                                      ? "border-accent/50 text-accent shadow-[0_0_20px_rgba(16,185,129,0.15)] bg-accent/5"
                                      : "border-[var(--border-subtle)] focus:border-accent/70 focus:bg-accent/5 focus:-translate-y-1 focus:shadow-[0_10px_20px_rgba(16,185,129,0.1)]"
                                }
                                ${verifying ? "opacity-50 cursor-not-allowed" : ""}
                            `}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-3 border border-red-500/20 bg-red-500/5 rounded-none mb-6 w-full text-center">
            <p className="text-red-500/90 font-mono text-xs font-bold tracking-widest uppercase animate-pulse">
              {error}
            </p>
          </div>
        )}

        {/* Submit button - Enhanced */}
        <button
          onClick={() => handleSubmit(code.join(""))}
          disabled={verifying || code.some((d) => d === "")}
          className="group relative w-full sm:w-auto px-14 py-5 bg-gradient-to-r from-accent to-accent text-black font-black text-xs sm:text-sm uppercase tracking-[0.3em] hover:bg-white transition-all duration-300 rounded-none shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:shadow-[0_0_50px_rgba(16,185,129,0.4)] disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 overflow-hidden"
        >
          {/* Button shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-opacity duration-300" />
          <span className="relative flex items-center justify-center gap-2">
            <svg
              className="w-4 h-4 flex-shrink-0 group-hover:animate-bounce"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
            {verifying ? "VERIFYING..." : "VERIFY CODE"}
          </span>
        </button>

        {!email && (
          <p className="mt-8 p-3 w-full text-center border border-red-500/20 bg-red-500/5 text-text-disabled font-mono text-xs rounded-none uppercase tracking-widest">
            ERROR: EMAIL BINDING LOST.
            <br /> RETURN TO LOGIN.
          </p>
        )}
      </LiquidGlass>

      <div className="fixed bottom-12 left-0 w-full text-center z-20">
        <p className="text-[10px] font-mono text-gray-700 uppercase tracking-[0.5em] animate-in fade-in">
          Access Node Online
        </p>
        {/* Status indicator */}
        <div className="flex justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-sm bg-accent shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
            <span className="text-gray-700/60">System Operational</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-accent uppercase tracking-widest">
          Loading
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
