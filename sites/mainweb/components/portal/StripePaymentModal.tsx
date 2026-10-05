"use client";

import { useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { X, Shield, Lock } from "lucide-react";
import { useState } from "react";
import { useTheme } from "next-themes";
import { formatCents } from "@query/api/pricing";
import { useIsClient } from "@/lib/use-is-client";
import {
  body,
  btnPrimary,
  btnSecondary,
  itemTitle,
  meta,
  status,
} from "@/components/portal/ui";

// ── Inner form (must be inside <Elements>) ─────────────────────────────────
function CheckoutForm({
  onSuccess,
  onCancel,
  onConfirmPayment,
  onUnconfirmed,
  onProcessingChange,
  amountCents,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  onConfirmPayment: (paymentIntentId: string) => Promise<void>;
  onUnconfirmed: () => void;
  onProcessingChange: (processing: boolean) => void;
  amountCents: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  useEffect(
    () => onProcessingChange(processing),
    [processing, onProcessingChange],
  );
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    // Stripe.js rejects rather than returning { error } on an integration
    // failure. processing would stay set, and the modal refuses to close while
    // it is.
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Payment failed");
        setProcessing(false);
        return;
      }

      const { error: confirmError, paymentIntent } =
        await stripe.confirmPayment({
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
        /**
         * The card has cleared by this point, so the money is already gone. The
         * server call that records it is therefore retried rather than failed on
         * the first error — it is idempotent (keyed on the PaymentIntent id) and
         * a transient blip here is the difference between a membership and a
         * charge with nothing to show for it.
         */
        const confirmWithRetry = async () => {
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await onConfirmPayment(paymentIntent.id);
              return true;
            } catch (err) {
              lastError = err;
              await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            }
          }
          throw lastError;
        };

        try {
          await confirmWithRetry();
          setSucceeded(true);
          setProcessing(false);
          setTimeout(() => onSuccess(), 1200);
        } catch {
          onUnconfirmed();
          // Deliberately reassuring: the payment succeeded, and both the webhook
          // and the reconcile-on-load path will pick it up. Telling someone
          // "contact support" about money they have already paid, when it will
          // resolve itself, generates a ticket for nothing.
          setError(
            "Your payment went through, but activating the membership is taking a moment. It will appear automatically — reload the portal shortly.",
          );
          setProcessing(false);
        }
      } else {
        setError("Unexpected payment status. Please contact support.");
        setProcessing(false);
      }
    } catch {
      setError("Payment failed. Please try again.");
      setProcessing(false);
    }
  };

  if (succeeded) {
    return (
      <div role="status" className="py-8">
        <p className={status("success")}>Paid</p>
        <p className={`mt-2 ${itemTitle}`}>Payment received</p>
        <p className={`mt-1 ${body}`}>Activating your membership…</p>
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
        <p className="border-l-2 border-[var(--warning)] pl-3 text-[15px] leading-relaxed text-[var(--text-primary)]">
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className={`flex-1 ${btnSecondary}`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className={`flex-[2] ${btnPrimary}`}
        >
          {processing ? (
            <>
              <span
                aria-hidden="true"
                className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
              />
              Processing…
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Pay {formatCents(amountCents)}
            </>
          )}
        </button>
      </div>

      <p className={`flex items-center gap-1.5 ${meta}`}>
        <Shield className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Secured by Stripe. Your card details never touch our servers.
      </p>
    </form>
  );
}

// ── Modal shell ────────────────────────────────────────────────────────────
interface StripePaymentModalProps {
  clientSecret: string;
  publishableKey: string;
  isMock?: boolean;
  /** Present only in mock mode: the synthetic PaymentIntent id the server
   *  minted, so the simulated payment goes through the real confirm path. */
  mockPaymentIntentId?: string;
  onSuccess: () => void;
  onClose: () => void;
  onConfirmPayment: (paymentIntentId: string) => Promise<void>;
  onUnconfirmed?: () => void;
  amountCents: number;
}

export function StripePaymentModal({
  clientSecret,
  publishableKey,
  isMock = false,
  mockPaymentIntentId,
  onSuccess,
  onClose,
  onConfirmPayment,
  onUnconfirmed,
  amountCents,
}: StripePaymentModalProps) {
  const stripePromise = useMemo(
    () => (!isMock && publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey, isMock],
  );
  // Used only by the mock branch below; the real flow keeps its own state
  // inside the Elements form and reports it through `charging`.
  const [processing, setProcessing] = useState(false);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape, the backdrop and the X all close — but not mid-charge. Closing
  // then hid the outcome, and reopening mints a fresh intent the member could
  // pay a second time.
  const close = useCallback(() => {
    if (!processing && !charging) onClose();
  }, [processing, charging, onClose]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    },
    [close],
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
          /**
           * `color` is set explicitly on every input state.
           *
           * The rules below override the input background, which takes it out
           * of whatever the chosen theme pairs it with — so relying on the
           * theme's default text colour left typed card numbers dark-on-dark
           * and unreadable once you clicked into a field.
           */
          ".Input": {
            border: isLight ? "1px solid #e4e4e7" : "1px solid #2e2e2e",
            backgroundColor: isLight ? "#f9fafb" : "#0a0a0a",
            color: isLight ? "#09090b" : "#ffffff",
            boxShadow: "none",
          },
          ".Input:focus": {
            border: isLight ? "1px solid #007a7a" : "1px solid #00A8A8",
            backgroundColor: isLight ? "#ffffff" : "#0a0a0a",
            color: isLight ? "#09090b" : "#ffffff",
            boxShadow: isLight
              ? "0 0 0 2px rgba(0,122,122,0.12)"
              : "0 0 0 2px rgba(0,168,168,0.15)",
          },
          ".Input--invalid": {
            color: isLight ? "#09090b" : "#ffffff",
          },
          ".Input::placeholder": {
            color: isLight ? "#a1a1aa" : "#6b6b6b",
          },
          ".Label": {
            fontWeight: "500",
            fontSize: "13px",
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
      <ModalShell onClose={close} amountCents={amountCents}>
        <div className="space-y-4">
          <p className={body}>
            <span className="font-semibold text-[var(--text-primary)]">
              Test mode.
            </span>{" "}
            No real charge will occur.
          </p>
          <button
            type="button"
            onClick={async () => {
              // Goes through the real server confirm, exactly as a card
              // payment does. Calling onSuccess() directly is what made the
              // UI say "Access Granted" with no member row behind it.
              if (!mockPaymentIntentId) {
                setError("Mock payment intent missing — restart the flow.");
                return;
              }
              setProcessing(true);
              setError(null);
              try {
                await onConfirmPayment(mockPaymentIntentId);
                setProcessing(false);
                onSuccess();
              } catch (err) {
                setProcessing(false);
                setError(
                  err instanceof Error
                    ? err.message
                    : "Mock payment failed to record.",
                );
              }
            }}
            disabled={processing}
            className={`w-full ${btnPrimary}`}
          >
            {processing ? "Recording…" : "Simulate successful payment"}
          </button>
          {error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      </ModalShell>
    );
  }

  if (!stripePromise) return null;

  return (
    <ModalShell onClose={close} amountCents={amountCents}>
      <Elements stripe={stripePromise} options={options}>
        <CheckoutForm
          onSuccess={onSuccess}
          onCancel={onClose}
          onConfirmPayment={onConfirmPayment}
          onUnconfirmed={onUnconfirmed ?? (() => {})}
          onProcessingChange={setCharging}
          amountCents={amountCents}
        />
      </Elements>
    </ModalShell>
  );
}

// ── Shared modal shell ─────────────────────────────────────────────────────
function ModalShell({
  children,
  onClose,
  amountCents,
}: {
  children: React.ReactNode;
  onClose: () => void;
  amountCents: number;
}) {
  /**
   * Rendered into document.body rather than in place.
   *
   * The membership card this opens from is a `.card-printed` container with
   * `overflow: hidden` and `.card-printed > * { z-index: 2 }`, so a modal
   * mounted inside it is clipped to the card and trapped in that subtree's
   * stacking order — the page behind stayed visible instead of being covered.
   * A portal puts it at the top level where `fixed inset-0` means the whole
   * viewport.
   */
  const mounted = useIsClient();
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--ui-scrim)] animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-medium)] bg-[var(--bg-card)] shadow-xl animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <p className={itemTitle}>DSGT membership</p>
            <p className={`mt-0.5 ${meta}`}>
              {formatCents(amountCents)} · Secure checkout
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 p-2 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
