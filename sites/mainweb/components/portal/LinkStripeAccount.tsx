"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { useInvalidatePortalContext } from "@/lib/use-portal-context";
import {
  MEMBERSHIP_CENTS,
  SEMESTER_MEMBERSHIP_CENTS,
  BOOTCAMP_ADDON_CENTS,
  priceForCents,
  formatCents,
} from "@query/api/pricing";
import type { MembershipPlan } from "@query/db/services/membership";
import {
  body,
  btnPrimary,
  fieldLabel,
  input,
  itemTitle,
  meta,
  status,
  textLink,
} from "@/components/portal/ui";

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
      <div role="status">
        <p className={status("success")}>Membership active</p>
        <p className={`mt-2 ${body}`}>
          Your membership is activated. Refreshing…
        </p>
      </div>
    );
  }

  // ── Loading / syncing state ──────────────────────────────────────────────
  if (isChecking) {
    return (
      <div role="status" className="flex items-center gap-3 py-2">
        <span
          aria-hidden="true"
          className="w-4 h-4 rounded-full border-2 border-[var(--border-medium)] border-t-accent animate-spin"
        />
        <p className={body}>Checking for an existing payment…</p>
      </div>
    );
  }

  // ── Link existing payment form ───────────────────────────────────────────
  if (showLinkForm) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className={itemTitle}>Link a payment you already made</h3>
          <button
            type="button"
            onClick={() => {
              setShowLinkForm(false);
              setError(null);
            }}
            className={textLink}
          >
            Back
          </button>
        </div>

        <p className={`mt-2 ${body}`}>
          Enter the name and email you used when paying through Stripe, and
          we&apos;ll attach that payment to this account.
        </p>

        <form onSubmit={handleLinkSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="first-name" className={fieldLabel}>
                First name
              </label>
              <input
                id="first-name"
                type="text"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                className={input}
                placeholder="John"
                required
              />
            </div>
            <div>
              <label htmlFor="last-name" className={fieldLabel}>
                Last name
              </label>
              <input
                id="last-name"
                type="text"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                className={input}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="payment-email" className={fieldLabel}>
              Payment email
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
              className={input}
              placeholder="you@example.com"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-[15px] text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={linkMutation.isPending}
            className={`w-full ${btnPrimary}`}
          >
            {linkMutation.isPending ? "Verifying…" : "Link payment"}
          </button>
        </form>
      </div>
    );
  }

  // ── Default: choose a term and pay ───────────────────────────────────────
  const totalCents = priceForCents(wantsBootcamp, plan);

  return (
    <>
      <div>
        {/* Term choice. The server prices from the same constants, so a
            tampered selection cannot buy a year for the semester price. */}
        <fieldset>
          <legend className={fieldLabel}>
            Same access either way. Pick how long you want it for.
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {(
              [
                { value: "annual", label: "Yearly", cents: MEMBERSHIP_CENTS, note: "Full year" },
                { value: "semester", label: "Semester", cents: SEMESTER_MEMBERSHIP_CENTS, note: "Ends with the term" },
              ] as const
            ).map((option) => {
              const selected = plan === option.value;
              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-[var(--radius-sm)] border p-4 transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent ${
                    selected
                      ? "border-accent bg-[var(--accent-dim)]"
                      : "border-[var(--border-medium)] hover:border-[var(--border-hover)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="membership-plan"
                    value={option.value}
                    checked={selected}
                    onChange={() => setPlan(option.value)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <span
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 flex-shrink-0 rounded-full border ${
                        selected
                          ? "border-[4px] border-accent"
                          : "border-[var(--border-hover)]"
                      }`}
                    />
                    {option.label}
                  </span>
                  <span className="mt-2 block font-[family-name:var(--font-display)] text-[40px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">
                    {formatCents(option.cents)}
                  </span>
                  <span className={`mt-2 block ${meta}`}>{option.note}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Add-on, priced from the same constants the server charges from. */}
        <label className="mt-5 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={wantsBootcamp}
            onChange={(e) => setWantsBootcamp(e.target.checked)}
            className="mt-1 h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
          />
          <span className={body}>
            <span className="font-semibold text-[var(--text-primary)]">
              Add Bootcamp access
            </span>{" "}
            for {formatCents(BOOTCAMP_ADDON_CENTS)} more, charged together.
          </span>
        </label>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleOpenModal}
            disabled={createIntentMutation.isPending}
            className={`w-full sm:w-auto ${btnPrimary}`}
          >
            {createIntentMutation.isPending ? (
              <>
                <span
                  aria-hidden="true"
                  className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                />
                Opening…
              </>
            ) : (
              <>Pay {formatCents(totalCents)}</>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowLinkForm(true)}
            className={`self-start sm:self-auto ${textLink}`}
          >
            Already paid? Link your payment
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[15px] text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>

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
          amountCents={totalCents}
          onClose={() => {
            setShowModal(false);
            setPaymentData(null);
          }}
        />
      )}
    </>
  );
}
