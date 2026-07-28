"use client";

import { useEffect, useCallback, useMemo } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { X, Shield, Lock } from "lucide-react";
import { useState } from "react";
import { useTheme } from "next-themes";

// ── Inner form (must be inside <Elements>) ─────────────────────────────────
function CheckoutForm({
  onSuccess,
  onCancel,
  onConfirmPayment,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  onConfirmPayment: (paymentIntentId: string) => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Payment failed");
      setProcessing(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      setProcessing(false);
    } else if (paymentIntent?.status === "succeeded") {
      // Server-side confirmation: record payment + activate membership
      try {
        await onConfirmPayment(paymentIntent.id);
        setSucceeded(true);
        setProcessing(false);
        setTimeout(() => onSuccess(), 1200);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Confirmation failed. Contact support.";
        setError(msg);
        setProcessing(false);
      }
    } else {
      setError("Unexpected payment status. Please contact support.");
      setProcessing(false);
    }
  };

  if (succeeded) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center animate-in zoom-in-75 duration-300">
          <svg
            className="w-8 h-8 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-[var(--text-primary)]">
            Payment Successful!
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Activating your membership…
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />

      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-medium)]">
          <span className="text-[var(--text-muted)] text-sm mt-0.5 flex-shrink-0">
            !
          </span>
          <p className="text-sm text-[var(--text-muted)]">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 px-5 py-3 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-ui text-sm font-bold uppercase tracking-widest disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-[2] px-5 py-3 rounded-sm bg-[var(--accent)] text-white font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-ui disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Pay $15.00
            </>
          )}
        </button>
      </div>

      <p className="text-center text-[10px] text-[var(--text-subtle)] flex items-center justify-center gap-1.5">
        <Shield className="w-3 h-3" />
        Secured by Stripe · Your card info is never stored on our servers
      </p>
    </form>
  );
}

// ── Modal shell ────────────────────────────────────────────────────────────
interface StripePaymentModalProps {
  clientSecret: string;
  publishableKey: string;
  isMock?: boolean;
  onSuccess: () => void;
  onClose: () => void;
  onConfirmPayment: (paymentIntentId: string) => Promise<void>;
}

export function StripePaymentModal({
  clientSecret,
  publishableKey,
  isMock = false,
  onSuccess,
  onClose,
  onConfirmPayment,
}: StripePaymentModalProps) {
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    if (!isMock && publishableKey) {
      setStripePromise(loadStripe(publishableKey));
    }
  }, [publishableKey, isMock]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  const options: StripeElementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: isLight ? "stripe" : "night",
        variables: {
          colorPrimary: isLight ? "#007a7a" : "#00A8A8",
          colorBackground: isLight ? "#ffffff" : "#121212",
          colorText: isLight ? "#09090b" : "#ededed",
          colorTextSecondary: isLight ? "#71717a" : "#a1a1aa",
          colorDanger: "#ef4444",
          fontFamily: "'Inter', 'Geist Sans', system-ui, sans-serif",
          borderRadius: "4px",
          spacingUnit: "4px",
          colorIconCardError: "#ef4444",
        },
        rules: {
          ".Input": {
            border: isLight ? "1px solid #e4e4e7" : "1px solid #2e2e2e",
            backgroundColor: isLight ? "#f9fafb" : "#0a0a0a",
            boxShadow: "none",
          },
          ".Input:focus": {
            border: isLight ? "1px solid #007a7a" : "1px solid #00A8A8",
            boxShadow: isLight
              ? "0 0 0 2px rgba(0,122,122,0.12)"
              : "0 0 0 2px rgba(0,168,168,0.15)",
          },
          ".Label": {
            fontWeight: "600",
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: isLight ? "#71717a" : "#a1a1a1",
          },
          ".Tab": {
            border: isLight ? "1px solid #e4e4e7" : "1px solid #2e2e2e",
            backgroundColor: isLight ? "#ffffff" : "#121212",
          },
          ".Tab--selected": {
            border: isLight ? "1px solid #007a7a" : "1px solid #00A8A8",
            backgroundColor: isLight
              ? "rgba(0,122,122,0.06)"
              : "rgba(0,168,168,0.08)",
          },
        },
      },
    }),
    [clientSecret, isLight],
  );

  // Early returns must stay below every hook call so the hook order is stable.
  // Mock mode — skip real Stripe Elements
  if (isMock) {
    return (
      <ModalShell onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)] font-mono bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3">
            🧪 Dev mock mode — no real charge will occur
          </p>
          <button
            type="button"
            onClick={() => {
              setTimeout(onSuccess, 500);
            }}
            className="w-full px-5 py-3 rounded-sm bg-[var(--accent)] text-white font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-ui"
          >
            Simulate Successful Payment
          </button>
        </div>
      </ModalShell>
    );
  }

  if (!stripePromise) return null;

  return (
    <ModalShell onClose={onClose}>
      <Elements stripe={stripePromise} options={options}>
        <CheckoutForm
          onSuccess={onSuccess}
          onCancel={onClose}
          onConfirmPayment={onConfirmPayment}
        />
      </Elements>
    </ModalShell>
  );
}

// ── Shared modal shell ─────────────────────────────────────────────────────
function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-250">
        {/* Card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-lg shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm bg-[var(--accent-dim)] border border-[var(--border-accent)]/30 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[var(--accent)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  DSGT Membership
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  $15.00 / year · Secure checkout
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-sm text-[var(--text-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-ui"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
