"use client";

import React, { useState } from "react";
import type { RouterOutputs } from "@query/api";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnInk,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  meta,
  status,
} from "@/components/portal/ui";
import { pointsLabel } from "@/components/hackathon/points/format";
import { Toggle } from "./Toggle";

type Item = RouterOutputs["points"]["store"]["items"][number];

type ItemForm = {
  name: string;
  description: string;
  price: string;
  stock: string;
  soldOut: boolean;
  displayOrder: string;
};

const emptyForm: ItemForm = {
  name: "",
  description: "",
  price: "",
  stock: "",
  soldOut: false,
  displayOrder: "0",
};

function formFrom(item: Item): ItemForm {
  return {
    name: item.name,
    description: item.description ?? "",
    price: String(item.price),
    stock: item.stock === null ? "" : String(item.stock),
    soldOut: item.soldOut,
    displayOrder: String(item.displayOrder),
  };
}

/** Counted down to zero, or switched off by hand while nobody counts. */
function soldOut(item: Item): boolean {
  return item.stock === null ? item.soldOut : item.stock < 1;
}

/** The store's polled catalog, shared with the sale station (same key). */
export function useStoreItems(hackathonId: string) {
  return trpc.points.store.items.useQuery(
    { hackathonId, includeArchived: true },
    { refetchInterval: 10_000 },
  );
}

/**
 * The catalog: add, edit, sold out, archive, order. Edits carry the revision
 * the form opened at; a sale bumps it too, so the server refuses a form that
 * would write an old stock count over one that changed while it was open.
 */
export function StoreItems({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const utils = trpc.useUtils();
  const items = useStoreItems(hackathonId);

  const [editing, setEditing] = useState<
    { itemId: null } | { itemId: string; revision: number } | null
  >(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [rowError, setRowError] = useState<{
    itemId: string;
    message: string;
  } | null>(null);

  const refresh = () => void utils.points.store.items.invalidate({ hackathonId });

  const close = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const create = trpc.points.store.createItem.useMutation({
    onSuccess: () => {
      refresh();
      close();
    },
  });
  const update = trpc.points.store.updateItem.useMutation({
    onSuccess: () => {
      refresh();
      close();
    },
  });
  // Archive, restore and the sold-out switch, from the row.
  const quickUpdate = trpc.points.store.updateItem.useMutation({
    onSuccess: refresh,
    onError: (error, variables) => {
      setRowError({
        itemId: variables.itemId,
        message: trpcErrorMessage(error, "Couldn't change this item."),
      });
      refresh();
    },
  });
  const remove = trpc.points.store.deleteItem.useMutation({
    onSuccess: refresh,
    onError: (error, variables) =>
      setRowError({
        itemId: variables.itemId,
        message: trpcErrorMessage(error, "Couldn't delete this item."),
      }),
  });

  const openCreate = () => {
    create.reset();
    update.reset();
    setForm(emptyForm);
    setEditing({ itemId: null });
  };

  const openEdit = (item: Item) => {
    create.reset();
    update.reset();
    setForm(formFrom(item));
    setEditing({ itemId: item.id, revision: item.revision });
  };

  // After a refusal: the form takes the item as it is now, and the
  // organiser's edits go, since they were made against something else.
  const reloadEditing = async () => {
    if (!editing?.itemId) return;
    const fresh = await items.refetch();
    const item = fresh.data?.find((row) => row.id === editing.itemId);
    if (item) openEdit(item);
    else close();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fields = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      stock: form.stock.trim() === "" ? null : Number(form.stock),
      soldOut: form.soldOut,
      displayOrder: Number(form.displayOrder) || 0,
    };
    if (editing?.itemId) {
      update.mutate({
        hackathonId,
        itemId: editing.itemId,
        revision: editing.revision,
        ...fields,
      });
    } else {
      create.mutate({ hackathonId, ...fields });
    }
  };

  const all = items.data ?? [];
  const editedNow =
    editing?.itemId != null
      ? all.find((row) => row.id === editing.itemId)
      : undefined;
  // Known before saving, from the poll: a sale or another organiser moved it.
  const changedUnderneath =
    !!editing?.itemId &&
    !!editedNow &&
    editedNow.revision !== editing.revision;
  const formError = create.error ?? update.error;
  const conflict = update.error?.data?.code === "CONFLICT";
  const pending = create.isPending || update.isPending;
  const counted = form.stock.trim() !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h3 className={itemTitle}>Items</h3>
          <p className={`mt-1 ${meta}`}>
            {all.filter((row) => !row.archived).length} in the catalog
            {all.some((row) => row.archived)
              ? ` · ${all.filter((row) => row.archived).length} archived`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={readOnly}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnSecondary}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          New item
        </button>
      </div>

      {editing && (
        <section className="border-y border-[var(--border-subtle)] py-6">
          <h4 className="mb-5 text-[17px] font-semibold text-[var(--text-primary)]">
            {editing.itemId ? `Edit ${editedNow?.name ?? "item"}` : "New item"}
          </h4>
          <form onSubmit={submit} className="max-w-3xl space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_10rem]">
              <div>
                <label htmlFor="store-item-name" className={fieldLabel}>
                  Name
                </label>
                <input
                  id="store-item-name"
                  type="text"
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Hacklytics T-shirt"
                  className={input}
                />
              </div>
              <div>
                <label htmlFor="store-item-price" className={fieldLabel}>
                  Price in points
                </label>
                <input
                  id="store-item-price"
                  type="number"
                  inputMode="numeric"
                  required
                  min={0}
                  step={1}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className={`tabular-nums ${input}`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="store-item-description" className={fieldLabel}>
                Description (optional)
              </label>
              <textarea
                id="store-item-description"
                rows={2}
                maxLength={2000}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Sizes S to XL, while they last"
                className={`resize-none ${input}`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="store-item-stock" className={fieldLabel}>
                  Stock (optional)
                </label>
                <input
                  id="store-item-stock"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={`tabular-nums ${input}`}
                />
                <p className={fieldHint}>
                  Leave blank if nobody is counting. Counted stock goes down
                  with each sale and sells out at zero.
                </p>
              </div>
              <div>
                <label htmlFor="store-item-order" className={fieldLabel}>
                  Position
                </label>
                <input
                  id="store-item-order"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm({ ...form, displayOrder: e.target.value })
                  }
                  className={`tabular-nums ${input}`}
                />
                <p className={fieldHint}>
                  Lower numbers come first in the catalog.
                </p>
              </div>
            </div>

            <div>
              <Toggle
                id="store-item-sold-out"
                checked={!counted && form.soldOut}
                disabled={counted}
                onChange={(next) => setForm({ ...form, soldOut: next })}
                label="Sold out"
              />
              <p className={`-mt-1 ${fieldHint}`}>
                {counted
                  ? "Counted stock sells out on its own at zero."
                  : "For items nobody is counting: switch on when the last one goes."}
              </p>
            </div>

            {changedUnderneath && !formError && (
              <p className="border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--warning)]">
                This item changed since you opened it, by a sale or another
                organiser. Saving will be refused; reload it first.
              </p>
            )}

            {formError && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 border-l-2 border-[var(--danger)] pl-3"
              >
                <p className="text-[15px] text-[var(--danger)]">
                  {trpcErrorMessage(formError, "Couldn't save this item.")}
                </p>
                {conflict && (
                  <button
                    type="button"
                    onClick={() => void reloadEditing()}
                    className={btnSecondary}
                  >
                    Reload item
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={readOnly || pending}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnInk}
              >
                {pending
                  ? "Saving…"
                  : editing.itemId
                    ? "Save changes"
                    : "Add item"}
              </button>
              {changedUnderneath && (
                <button
                  type="button"
                  onClick={() => void reloadEditing()}
                  className={btnSecondary}
                >
                  Reload item
                </button>
              )}
              <button type="button" onClick={close} className={btnSecondary}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {items.isLoading ? (
        <p className={body}>Loading items…</p>
      ) : items.isError && !items.data ? (
        <p className="text-[15px] text-[var(--danger)]">
          {trpcErrorMessage(items.error, "Couldn't load the catalog.")} It
          retries every few seconds.
        </p>
      ) : all.length === 0 ? (
        <p className={`border-t border-[var(--border-subtle)] pt-5 ${body}`}>
          No items yet. Add the first one; hackers see it once the catalog is
          shown.
        </p>
      ) : (
        <ul className="border-t border-[var(--border-subtle)]">
          {all.map((item) => (
            <li
              key={item.id}
              className={`border-b border-[var(--border-subtle)] py-4 ${
                editing?.itemId === item.id ? "border-l-2 border-l-accent pl-4" : ""
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className={`text-[15px] font-semibold ${item.archived ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}
                    >
                      {item.name}
                    </span>
                    {item.archived ? (
                      <span className={status("neutral")}>Archived</span>
                    ) : (
                      soldOut(item) && (
                        <span className={status("warning")}>Sold out</span>
                      )
                    )}
                  </p>
                  <p className={`mt-0.5 tabular-nums ${meta}`}>
                    {pointsLabel(item.price)} ·{" "}
                    {item.stock === null
                      ? "Stock not counted"
                      : `${item.stock} left`}{" "}
                    · Position {item.displayOrder}
                  </p>
                  {item.description && (
                    <p className={`mt-0.5 line-clamp-1 ${meta}`}>
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    disabled={readOnly}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={btnSecondary}
                  >
                    Edit
                  </button>
                  {item.stock === null && !item.archived && (
                    <button
                      type="button"
                      onClick={() => {
                        setRowError(null);
                        quickUpdate.mutate({
                          hackathonId,
                          itemId: item.id,
                          revision: item.revision,
                          soldOut: !item.soldOut,
                        });
                      }}
                      disabled={readOnly || quickUpdate.isPending}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      className={btnSecondary}
                    >
                      {item.soldOut ? "Back in stock" : "Mark sold out"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRowError(null);
                      quickUpdate.mutate({
                        hackathonId,
                        itemId: item.id,
                        revision: item.revision,
                        archived: !item.archived,
                      });
                    }}
                    disabled={readOnly || quickUpdate.isPending}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={btnSecondary}
                  >
                    {item.archived ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete ${item.name}? This cannot be undone. Items that have sold can only be archived.`,
                        )
                      )
                        return;
                      setRowError(null);
                      remove.mutate({ hackathonId, itemId: item.id });
                    }}
                    disabled={readOnly || remove.isPending}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={btnDanger}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {rowError?.itemId === item.id && (
                <p
                  role="alert"
                  className="mt-3 border-l-2 border-[var(--danger)] pl-3 text-[13px] text-[var(--danger)]"
                >
                  {rowError.message}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
