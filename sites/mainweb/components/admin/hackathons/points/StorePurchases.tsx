"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  meta,
  status,
} from "@/components/portal/ui";
import { pointsLabel } from "@/components/hackathon/points/format";
import { Toggle } from "./Toggle";

const PAGE_SIZE = 25;

/**
 * Sales, newest first, and the way to undo one. A void keeps the row and
 * gives the points back; restocking is offered only where stock was counted
 * at the sale and still is.
 */
export function StorePurchases({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(0);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);

  const sales = trpc.points.store.purchases.useQuery(
    { hackathonId, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { refetchInterval: 10_000, placeholderData: (previous) => previous },
  );

  const voidSale = trpc.points.store.voidPurchase.useMutation({
    onSuccess: () => {
      setVoiding(null);
      setReason("");
      setRestock(false);
      void utils.points.store.purchases.invalidate({ hackathonId });
      void utils.points.store.items.invalidate({ hackathonId });
      void utils.points.store.lookupParticipant.invalidate({ hackathonId });
      void utils.points.admin.invalidate();
    },
  });

  const openVoid = (id: string) => {
    voidSale.reset();
    setReason("");
    setRestock(false);
    setVoiding(id);
  };

  const rows = sales.data?.purchases ?? [];
  const matching = sales.data?.matching ?? 0;
  const lastPage = Math.max(0, Math.ceil(matching / PAGE_SIZE) - 1);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className={itemTitle}>Recent sales</h3>
        <span className={`tabular-nums ${meta}`}>{matching} total</span>
      </div>

      {sales.isLoading ? (
        <p className={meta}>Loading sales…</p>
      ) : sales.isError && !sales.data ? (
        <p className="text-[15px] text-[var(--danger)]">
          {trpcErrorMessage(sales.error, "Couldn't load sales.")} It retries
          every few seconds.
        </p>
      ) : rows.length === 0 ? (
        <p className={`border-t border-[var(--border-subtle)] pt-4 ${body}`}>
          No sales yet. Each one recorded at the table appears here.
        </p>
      ) : (
        <ul className="border-t border-[var(--border-subtle)]">
          {rows.map((sale) => (
            <li
              key={sale.id}
              className="border-b border-[var(--border-subtle)] py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`text-[15px] ${sale.voidedAt ? "text-[var(--text-muted)] line-through decoration-[var(--text-subtle)]" : "text-[var(--text-primary)]"}`}
                  >
                    {sale.quantity > 1
                      ? `${sale.quantity} × ${sale.itemName}`
                      : sale.itemName}
                    <span className="mx-1.5 text-[var(--text-subtle)]">·</span>
                    {sale.participantName}
                  </p>
                  <p className={`mt-0.5 tabular-nums ${meta}`}>
                    {new Date(sale.createdAt).toLocaleString([], {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {sale.actorName ? ` · by ${sale.actorName}` : ""}
                  </p>
                  {sale.voidedAt && (
                    <p className="mt-1 flex flex-wrap gap-x-3">
                      <span className={status("neutral")}>
                        Voided{sale.restocked ? ", restocked" : ""}
                      </span>
                      {sale.voidReason && (
                        <span className={meta}>{sale.voidReason}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
                    {pointsLabel(sale.total)}
                  </span>
                  {!sale.voidedAt && voiding !== sale.id && (
                    <button
                      type="button"
                      onClick={() => openVoid(sale.id)}
                      disabled={readOnly}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      className={btnSecondary}
                    >
                      Void
                    </button>
                  )}
                </div>
              </div>

              {voiding === sale.id && (
                <form
                  className="mt-3 space-y-3 border-l-2 border-[var(--danger)]/60 pl-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!reason.trim()) return;
                    voidSale.mutate({
                      hackathonId,
                      purchaseId: sale.id,
                      reason,
                      restock: sale.canRestock && restock,
                    });
                  }}
                >
                  <div>
                    <label
                      htmlFor={`void-reason-${sale.id}`}
                      className={fieldLabel}
                    >
                      Why is this sale being voided?
                    </label>
                    <input
                      id={`void-reason-${sale.id}`}
                      type="text"
                      required
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Wrong size, swapped for a medium"
                      className={`min-h-11 ${input}`}
                    />
                  </div>
                  {sale.canRestock ? (
                    <Toggle
                      id={`void-restock-${sale.id}`}
                      checked={restock}
                      disabled={voidSale.isPending}
                      onChange={setRestock}
                      label={`Put ${sale.quantity} back on the shelf count`}
                    />
                  ) : (
                    <p className={meta}>
                      Stock was not counted for this sale, so nothing goes
                      back on the shelf count.
                    </p>
                  )}
                  {voidSale.error && (
                    <p role="alert" className="text-[13px] text-[var(--danger)]">
                      {trpcErrorMessage(voidSale.error, "Couldn't void this sale.")}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={readOnly || !reason.trim() || voidSale.isPending}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      className={btnDanger}
                    >
                      {voidSale.isPending
                        ? "Voiding…"
                        : `Void and return ${pointsLabel(sale.total)}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiding(null)}
                      className={btnSecondary}
                    >
                      Keep sale
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {matching > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <span className={`tabular-nums ${meta}`}>
            {page * PAGE_SIZE + 1}–{Math.min(matching, (page + 1) * PAGE_SIZE)}{" "}
            of {matching}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={btnSecondary}
            >
              Newer
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage}
              className={btnSecondary}
            >
              Older
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
