"use client";

import React, { useRef, useState } from "react";
import { Minus, Plus, QrCode } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  itemTitle,
  label,
  meta,
  status,
} from "@/components/portal/ui";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { pointsLabel } from "@/components/hackathon/points/format";
import { ParticipantSearch } from "./ParticipantSearch";
import { readPass } from "./pass";
import { useStoreItems } from "./StoreItems";

const MAX_QUANTITY = 20;

/**
 * One sale at the store table: find the buyer by pass or by name, pick an
 * item and a quantity, record it. The server re-checks everything inside one
 * transaction; this screen only keeps the obvious refusals from being sent.
 */
export function SaleStation({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const utils = trpc.useUtils();

  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // The sale's id is made in this browser and is the server's idempotency
  // key. It is kept while the same sale is retried, so a response lost on bad
  // venue wifi replays the sale that went through instead of charging twice,
  // and replaced as soon as the buyer, item, quantity or price changes.
  const attempt = useRef<{ fields: string; id: string } | null>(null);

  const items = useStoreItems(hackathonId);
  const buyer = trpc.points.store.lookupParticipant.useQuery(
    { hackathonId, participantId: buyerId ?? "" },
    { enabled: !!buyerId, refetchInterval: 10_000 },
  );

  const purchase = trpc.points.store.purchase.useMutation({
    onSuccess: (result) => {
      attempt.current = null;
      const sale = result.purchase;
      const what =
        sale.quantity > 1 ? `${sale.quantity} × ${sale.itemName}` : sale.itemName;
      setOutcome({
        ok: true,
        text: result.replayed
          ? `Already recorded: ${what} for ${sale.participantName}. Nothing was charged twice.`
          : `Sold ${what} to ${sale.participantName} for ${pointsLabel(sale.total)}. ${pointsLabel(result.balance.available)} left.`,
      });
      setItemId(null);
      setQuantity(1);
      void utils.points.store.items.invalidate({ hackathonId });
      void utils.points.store.purchases.invalidate({ hackathonId });
      void utils.points.store.lookupParticipant.invalidate({ hackathonId });
      void utils.points.admin.leaderboard.invalidate({ hackathonId });
    },
    onError: (error) => {
      // An answer from the server means the transaction rolled back, so the
      // next press is a new sale. Only a lost response keeps the id.
      if (error.data) attempt.current = null;
      setOutcome({
        ok: false,
        text: trpcErrorMessage(error, "The sale did not go through."),
      });
      void utils.points.store.items.invalidate({ hackathonId });
    },
  });

  const chooseBuyer = (id: string) => {
    setBuyerId(id);
    setOutcome(null);
    setScanError(null);
  };

  const handleScan = (codes: { rawValue: string }[]) => {
    const raw = codes[0]?.rawValue;
    if (!raw) return;
    const pass = readPass(raw, hackathonId);
    setScanning(false);
    if ("error" in pass) {
      setScanError(pass.error);
      return;
    }
    chooseBuyer(pass.participantId);
  };

  const catalog = (items.data ?? []).filter((item) => !item.archived);
  const item = catalog.find((row) => row.id === itemId) ?? null;
  const itemGone = (row: (typeof catalog)[number]) =>
    row.stock === null ? row.soldOut : row.stock < 1;
  const maxQuantity = Math.min(MAX_QUANTITY, item?.stock ?? MAX_QUANTITY);
  const total = item ? item.price * quantity : 0;
  const available = buyer.data?.balance.available ?? 0;
  const buyerReady = buyer.data?.registrationStatus === "checked_in";
  const short = item ? Math.max(0, total - available) : 0;

  const canSell =
    !readOnly &&
    !!buyer.data &&
    buyerReady &&
    !!item &&
    !itemGone(item) &&
    quantity <= maxQuantity &&
    short === 0 &&
    !purchase.isPending;

  const submit = () => {
    if (!buyer.data || !item || !canSell) return;
    const input = {
      hackathonId,
      participantId: buyer.data.id,
      itemId: item.id,
      quantity,
      unitPrice: item.price,
    };
    const fields = JSON.stringify(input);
    if (attempt.current?.fields !== fields) {
      attempt.current = { fields, id: crypto.randomUUID() };
    }
    setOutcome(null);
    purchase.mutate({ ...input, purchaseId: attempt.current.id });
  };

  return (
    <section className="space-y-6">
      {scanning && (
        <QRScannerModal
          onClose={() => setScanning(false)}
          onScan={handleScan}
          onError={(e: unknown) => console.error(e)}
        />
      )}

      <div>
        <h3 className={itemTitle}>Record a sale</h3>
        <p className={`mt-1 ${body}`}>
          Find the buyer, pick what they are taking, record it.
        </p>
      </div>

      {/* 1. Buyer */}
      <div className="space-y-3">
        <p className={label}>Buyer</p>
        {buyerId ? (
          <div className="flex flex-wrap items-start justify-between gap-3 border-l-2 border-l-accent pl-3">
            {buyer.data ? (
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold text-[var(--text-primary)]">
                  {buyer.data.name}
                </p>
                <p className={`flex flex-wrap gap-x-3 ${meta}`}>
                  <span className="truncate">{buyer.data.email}</span>
                  <StatusBadge status={buyer.data.registrationStatus} />
                </p>
                <p className="mt-1 text-[15px] tabular-nums text-[var(--text-primary)]">
                  {pointsLabel(buyer.data.balance.available)} to spend
                </p>
                {!buyerReady && (
                  <p className="mt-1 text-[13px] text-[var(--warning)]">
                    Not checked in at the registration desk, so they cannot
                    spend points yet.
                  </p>
                )}
              </div>
            ) : buyer.isError ? (
              <p className="text-[15px] text-[var(--danger)]">
                {trpcErrorMessage(buyer.error, "Couldn't load this buyer.")}
              </p>
            ) : (
              <p className={meta}>Loading buyer…</p>
            )}
            <button
              type="button"
              onClick={() => {
                setBuyerId(null);
                setOutcome(null);
              }}
              className={`min-h-11 ${btnSecondary}`}
            >
              Change buyer
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setScanError(null);
                setScanning(true);
              }}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={`min-h-11 w-full sm:w-auto ${btnSecondary}`}
            >
              <QrCode size={16} strokeWidth={1.75} aria-hidden="true" />
              Scan their pass
            </button>
            {scanError && (
              <p role="alert" className="text-[15px] text-[var(--danger)]">
                {scanError}
              </p>
            )}
            <ParticipantSearch
              hackathonId={hackathonId}
              label="Or search by name or email"
              onSelect={(match) => chooseBuyer(match.id)}
            />
          </div>
        )}
      </div>

      {/* 2. Item and quantity */}
      <fieldset className="space-y-3">
        <legend className={label}>Item</legend>
        {items.isLoading ? (
          <p className={meta}>Loading the catalog…</p>
        ) : catalog.length === 0 ? (
          <p className={body}>
            Nothing to sell yet. Add items under Items below.
          </p>
        ) : (
          <ul className="border-t border-[var(--border-subtle)]">
            {catalog.map((row) => {
              const gone = itemGone(row);
              const selected = row.id === itemId;
              return (
                <li key={row.id}>
                  <label
                    className={`flex min-h-11 items-center gap-3 border-b border-[var(--border-subtle)] px-1 py-2.5 transition-colors ${
                      gone
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer hover:bg-[var(--bg-secondary)]"
                    } ${selected ? "bg-[var(--accent-dim)]" : ""}`}
                  >
                    <input
                      type="radio"
                      name="sale-item"
                      value={row.id}
                      checked={selected}
                      disabled={gone}
                      onChange={() => {
                        setItemId(row.id);
                        setQuantity(1);
                        setOutcome(null);
                      }}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--text-primary)]">
                      {row.name}
                    </span>
                    <span className={`shrink-0 tabular-nums ${meta}`}>
                      {gone ? (
                        <span className={status("neutral")}>Sold out</span>
                      ) : row.stock !== null ? (
                        `${row.stock} left`
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[15px] tabular-nums text-[var(--text-primary)]">
                      {row.price.toLocaleString("en-US")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {item && (
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className={fieldLabel} id="sale-quantity-label">
              Quantity
            </p>
            <div
              role="group"
              aria-labelledby="sale-quantity-label"
              className="flex items-center gap-1"
            >
              <button
                type="button"
                aria-label="One fewer"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className={`h-11 w-11 px-0 ${btnSecondary}`}
              >
                <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <span
                aria-live="polite"
                className="w-10 text-center text-[20px] font-semibold tabular-nums text-[var(--text-primary)]"
              >
                {quantity}
              </span>
              <button
                type="button"
                aria-label="One more"
                disabled={quantity >= maxQuantity}
                onClick={() =>
                  setQuantity((q) => Math.min(maxQuantity, q + 1))
                }
                className={`h-11 w-11 px-0 ${btnSecondary}`}
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="pb-2">
            <p className="text-[17px] font-semibold tabular-nums text-[var(--text-primary)]">
              {pointsLabel(total)}
            </p>
            {itemGone(item) ? (
              <p className="text-[13px] text-[var(--danger)]">
                Sold out since you picked it. Pick something else.
              </p>
            ) : quantity > maxQuantity ? (
              <p className="text-[13px] tabular-nums text-[var(--danger)]">
                Only {maxQuantity} left. Lower the quantity.
              </p>
            ) : (
              buyer.data && (
                <p
                  className={`tabular-nums ${short > 0 ? "text-[13px] text-[var(--danger)]" : meta}`}
                >
                  {short > 0
                    ? `${pointsLabel(short)} short`
                    : `Leaves ${pointsLabel(available - total)}`}
                </p>
              )
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSell}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={`min-h-11 w-full sm:w-auto ${btnPrimary}`}
        >
          {purchase.isPending
            ? "Recording…"
            : purchase.isError && !purchase.error.data
              ? "Try again"
              : "Record sale"}
        </button>
        {outcome && (
          <p
            role={outcome.ok ? "status" : "alert"}
            className={`text-[15px] ${outcome.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {outcome.text}
          </p>
        )}
      </div>
    </section>
  );
}
