"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { useInvalidatePortalContext } from "@/lib/use-portal-context";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { CreditCard, Link as LinkIcon } from "lucide-react";
import {
  MEMBERSHIP_CENTS,
  SEMESTER_MEMBERSHIP_CENTS,
  BOOTCAMP_ADDON_CENTS,
  priceForCents,
  formatCents,
} from "@query/api/pricing";
import type { MembershipPlan } from "@query/db/services/membership";

const StripePaymentModal = dynamic(
  () =>
    import("@/components/portal/StripePaymentModal").then(
      (mod) => mod.StripePaymentModal,
    ),
  { ssr: false },
);

interface LinkStripeAccountProps {
  onSuccess?: () => void;
}

export default function LinkStripeAccount({
  onSuccess,
}: LinkStripeAccountProps) {
  const [showModal, setShowModal] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [wantsBootcamp, setWantsBootcamp] = useState(false);
  const [plan, setPlan] = useState<MembershipPlan>("annual");
  const [success, setSuccess] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Payment intent state (for the modal)
  const [paymentData, setPaymentData] = useState<{
    clientSecret: string;
    publishableKey: string;
    isMock: boolean;
    mockPaymentIntentId?: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const invalidatePortalContext = useInvalidatePortalContext();

  // Auto-link on mount
  const autoLinkMutation = trpc.stripe.attemptAutoLink.useMutation({
    onSuccess: (data) => {
      setIsChecking(false);
      if (data.success) {
        setSuccess(true);
        utils.member.checkStatus.invalidate();
        invalidatePortalContext();
        onSuccess?.();
      }
    },
    onError: () => setIsChecking(false),
  });

  /**
   * Recovers a charge Stripe took that never got recorded here — the case
   * where the browser died between the card clearing and the confirm call.
   * Runs on load so the money reappears as a membership without anyone
   * having to contact support.
   */
  const reconcileMutation = trpc.stripe.reconcileMyPayments.useMutation({
    onSuccess: (data) => {
      if (data.recovered > 0) {
        setSuccess(true);
        utils.member.checkStatus.invalidate();
        invalidatePortalContext();
        onSuccess?.();
      }
    },
  });

  // Guard: only fire once even in React StrictMode double-invoke
  const autoLinkFired = useRef(false);
  useEffect(() => {
    if (autoLinkFired.current) return;
    autoLinkFired.current = true;
    autoLinkMutation.mutate();
    reconcileMutation.mutate();
    // mutation refs are stable — intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-side confirm after payment
  const confirmMutation =
    trpc.stripe.confirmMembershipAfterPayment.useMutation();

  // Create Payment Intent (for modal)
  const createIntentMutation = trpc.stripe.createPaymentIntent.useMutation({
    onSuccess: (data) => {
      setPaymentData(data);
      setShowModal(true);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Link existing payment by email/name
  const linkMutation = trpc.stripe.linkAccount.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      utils.member.checkStatus.invalidate();
      // Sidebar and dashboard gate on portal context, not checkStatus.
      invalidatePortalContext();
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleOpenModal = () => {
    setError(null);
    createIntentMutation.mutate({ bootcamp: wantsBootcamp, plan });
  };

  const handlePaymentSuccess = () => {
    setShowModal(false);
    setPaymentData(null);
    setSuccess(true);
    invalidatePortalContext();
    utils.member.checkStatus.invalidate();
    onSuccess?.();
  };

  /**
   * The modal calls this when the card cleared but recording it did not. Money
   * has moved, so reconcile immediately rather than waiting for a remount —
   * the message shown to the user promises the membership will just appear.
   */
  const handlePaymentUnconfirmed = () => {
    reconcileMutation.mutate();
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    linkMutation.mutate(formData);
  };

  // ── Success state ────────────────────────────────────────────────────────
  if (success) {
    return (
      <LiquidGlass className="h-full p-8 flex flex-col items-center justify-center text-center !bg-emerald-500/[0.07] !border-emerald-500/30">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6 text-emerald-400"
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
        <p className="text-xs uppercase tracking-widest font-black mb-2 text-emerald-400">
          Access Granted
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Membership activated. Refreshing…
        </p>
      </LiquidGlass>
    );
  }

  // ── Loading / syncing state ──────────────────────────────────────────────
  if (isChecking) {
    return (
      <LiquidGlass className="relative h-full p-8 flex flex-col items-center justify-center text-center border-[var(--border-subtle)]">
        <div className="w-8 h-8 rounded-sm border-2 border-[var(--accent)] border-t-transparent animate-spin mb-4" />
        <p className="text-xs uppercase tracking-[0.2em] font-bold text-[var(--accent)]">
          Syncing…
        </p>
      </LiquidGlass>
    );
  }

  // ── Link existing payment form ───────────────────────────────────────────
  if (showLinkForm) {
    return (
      <LiquidGlass className="h-full p-8 border-[var(--border-accent)]/30">
        <div className="flex items-center justify-between mb-6 border-b border-[var(--border-subtle)] pb-4">
          <p className="text-xs uppercase tracking-[0.2em] font-black text-[var(--accent)]">
            Link Existing Payment
          </p>
          <button
            type="button"
            onClick={() => {
              setShowLinkForm(false);
              setError(null);
            }}
            className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] text-xs uppercase tracking-widest font-mono hover:bg-[var(--bg-secondary)] px-3 py-1.5 rounded-sm transition-ui"
          >
            [ Back ]
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] mb-5 leading-relaxed">
          Enter the name and email you used when paying through Stripe to link
          your existing payment.
        </p>

        <form onSubmit={handleLinkSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="first-name"
                className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest font-mono"
              >
                First Name
              </label>
              <input
                id="first-name"
                type="text"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-3 py-2.5 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-ui"
                placeholder="John"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="last-name"
                className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest font-mono"
              >
                Last Name
              </label>
              <input
                id="last-name"
                type="text"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-3 py-2.5 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-ui"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="payment-email"
              className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest font-mono"
            >
              Payment Email
            </label>
            <input
              id="payment-email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-3 py-2.5 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-ui"
              placeholder="you@example.com"
              required
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-medium)]">
              <p className="text-xs text-[var(--text-muted)]">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={linkMutation.isPending}
            className="w-full mt-1 px-4 py-3 bg-[var(--accent)] text-[var(--text-on-accent)] font-bold text-xs uppercase tracking-[0.2em] hover:opacity-90 transition-ui disabled:opacity-50 rounded-sm"
          >
            {linkMutation.isPending ? "Verifying…" : "Link Payment"}
          </button>
        </form>
      </LiquidGlass>
    );
  }

  // ── Default card ─────────────────────────────────────────────────────────
  return (
    <>
      <LiquidGlass className="relative h-full p-8 hover:!border-[var(--accent)]/30 transition-ui duration-300 flex flex-col group">
        {/* Decorative glow */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[var(--accent)]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-inherit" />

        <div className="relative z-10 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2 text-[var(--accent)]">
                Member Node
              </p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)]/50 animate-pulse" />
                <h3 className="text-xl font-bold text-[var(--text-subtle)] uppercase tracking-tight group-hover:text-[var(--accent)] transition-colors">
                  Inactive
                </h3>
              </div>
            </div>
            <div className="opacity-30 group-hover:opacity-100 transition-opacity">
              <CreditCard className="w-7 h-7 text-[var(--accent)]" />
            </div>
          </div>

          <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
            Membership verification required for portal access. Same access
            either way — pick how long you want it for.
          </p>

          {/* Term choice. The server prices from the same constants, so a
              tampered selection cannot buy a year for the semester price. */}
          <fieldset className="mb-3">
            <legend className="sr-only">Membership length</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "annual", label: "Yearly", cents: MEMBERSHIP_CENTS, note: "Full year" },
                  { value: "semester", label: "Semester", cents: SEMESTER_MEMBERSHIP_CENTS, note: "Ends with the term" },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-sm border p-3 transition-ui ${
                    plan === option.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-medium)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="membership-plan"
                    value={option.value}
                    checked={plan === option.value}
                    onChange={() => setPlan(option.value)}
                    className="sr-only"
                  />
                  <span className="block text-[10px] uppercase tracking-widest font-mono text-[var(--text-subtle)]">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-lg font-bold text-[var(--text-primary)]">
                    {formatCents(option.cents)}
                  </span>
                  <span className="block text-[10px] text-[var(--text-subtle)]">
                    {option.note}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Add-on, priced from the same constants the server charges from. */}
          <label className="flex items-start gap-3 mb-6 p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)] cursor-pointer hover:border-[var(--border-medium)] transition-ui">
            <input
              type="checkbox"
              checked={wantsBootcamp}
              onChange={(e) => setWantsBootcamp(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-muted)] leading-relaxed">
              <span className="font-bold text-[var(--text-primary)]">
                Add Bootcamp access
              </span>{" "}
              — {formatCents(BOOTCAMP_ADDON_CENTS)} more, charged together.
            </span>
          </label>

          <div className="mt-auto space-y-2.5">
            {/* Primary: open Stripe modal */}
            <button
              type="button"
              onClick={handleOpenModal}
              disabled={createIntentMutation.isPending}
              className="w-full py-3.5 px-4 bg-[var(--accent)] text-[var(--text-on-accent)] hover:opacity-90 text-xs font-bold tracking-[0.15em] uppercase transition-ui rounded-sm shadow-[0_4px_14px_rgba(0,168,168,0.25)] hover:shadow-[0_4px_20px_rgba(0,168,168,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {createIntentMutation.isPending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Opening…
                </>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" />
                  Pay Membership Dues ({formatCents(priceForCents(wantsBootcamp, plan))})
                </>
              )}
            </button>

            {/* Secondary: link existing */}
            <button
              type="button"
              onClick={() => setShowLinkForm(true)}
              className="w-full py-2.5 px-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-medium)] text-xs font-bold tracking-[0.15em] uppercase transition-ui rounded-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center gap-2"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Link Existing Payment
            </button>
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-medium)]">
              <p className="text-xs text-[var(--text-muted)]">{error}</p>
            </div>
          )}
        </div>
      </LiquidGlass>

      {/* Stripe Payment Modal */}
      {showModal && paymentData && (
        <StripePaymentModal
          clientSecret={paymentData.clientSecret}
          publishableKey={paymentData.publishableKey}
          isMock={paymentData.isMock}
          mockPaymentIntentId={paymentData.mockPaymentIntentId}
          onSuccess={handlePaymentSuccess}
          onConfirmPayment={async (paymentIntentId) => {
            await confirmMutation.mutateAsync({ paymentIntentId });
          }}
          onUnconfirmed={handlePaymentUnconfirmed}
          amountCents={priceForCents(wantsBootcamp, plan)}
          onClose={() => {
            setShowModal(false);
            setPaymentData(null);
          }}
        />
      )}
    </>
  );
}
