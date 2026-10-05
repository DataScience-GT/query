"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { useInvalidatePortalContext } from "@/lib/use-portal-context";
import { BOOTCAMP_ADDON_CENTS, formatCents } from "@query/api/pricing";
import { btnPrimary, fieldHint } from "@/components/portal/ui";

const StripePaymentModal = dynamic(
  () =>
    import("@/components/portal/StripePaymentModal").then(
      (mod) => mod.StripePaymentModal,
    ),
  { ssr: false },
);

/**
 * Buying the bootcamp alone, mid-year. The dashboard's join flow sells both as
 * one $35 purchase and only renders for non-members, so somebody who paid in
 * September had nowhere to go. The server prices it; this only asks.
 */
export function BootcampAddOn({ term }: { term: string }) {
  const utils = trpc.useUtils();
  const invalidatePortalContext = useInvalidatePortalContext();

  const [paymentData, setPaymentData] = useState<{
    clientSecret: string;
    publishableKey: string;
    isMock: boolean;
    mockPaymentIntentId?: string;
    amount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createIntent = trpc.stripe.createPaymentIntent.useMutation({
    onSuccess: (data) => {
      setPaymentData(data);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const confirm = trpc.stripe.confirmMembershipAfterPayment.useMutation();

  const finish = async () => {
    setPaymentData(null);
    invalidatePortalContext();
    await Promise.all([
      utils.bootcamp.myProgress.invalidate(),
      utils.member.checkStatus.invalidate(),
    ]);
  };

  return (
    <>
      <button
        type="button"
        disabled={createIntent.isPending}
        onClick={() => createIntent.mutate({ bootcamp: true })}
        className={`${btnPrimary} mt-6`}
      >
        {createIntent.isPending
          ? "Starting…"
          : `Join for ${formatCents(BOOTCAMP_ADDON_CENTS)}`}
      </button>

      <p className={fieldHint}>
        Covers {term}. Your membership is untouched — this does not renew it.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {paymentData && (
        <StripePaymentModal
          clientSecret={paymentData.clientSecret}
          publishableKey={paymentData.publishableKey}
          isMock={paymentData.isMock}
          mockPaymentIntentId={paymentData.mockPaymentIntentId}
          amountCents={paymentData.amount}
          onConfirmPayment={async (paymentIntentId) => {
            await confirm.mutateAsync({ paymentIntentId });
          }}
          onSuccess={finish}
          // Card cleared, recording did not — the webhook grants it from the
          // charged intent, so just refresh and let it appear.
          onUnconfirmed={finish}
          onClose={() => setPaymentData(null)}
        />
      )}
    </>
  );
}
