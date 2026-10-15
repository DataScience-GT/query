"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  meta,
} from "@/components/portal/ui";
import { Toggle } from "./Toggle";

/**
 * Whether hackers can see the catalog, whether the table is open, and where
 * it is. Visible and open are separate so the catalog can go up the night
 * before; closed is a note for hackers, not a lock on the station.
 */
export function StoreSettings({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const utils = trpc.useUtils();
  const settings = trpc.points.store.settings.useQuery({ hackathonId });

  // The field starts from the saved location and is only ours once edited.
  const [location, setLocation] = useState<string | null>(null);

  const update = trpc.points.store.updateSettings.useMutation({
    onSuccess: (saved, variables) => {
      utils.points.store.settings.setData({ hackathonId }, saved);
      // A toggle saved while the location is half-typed keeps the typing.
      if (variables.location !== undefined) setLocation(null);
    },
  });

  if (!settings.data) {
    return settings.isError ? (
      <p className="text-[15px] text-[var(--danger)]">
        {trpcErrorMessage(settings.error, "Couldn't load store settings.")}
      </p>
    ) : (
      <p className={meta}>Loading store settings…</p>
    );
  }

  const saved = settings.data;
  const locationValue = location ?? saved.location ?? "";
  const locationChanged = locationValue.trim() !== (saved.location ?? "");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-8">
        <Toggle
          id={`store-visible-${hackathonId}`}
          checked={saved.catalogVisible}
          disabled={readOnly || update.isPending}
          readOnly={readOnly}
          onChange={(catalogVisible) =>
            update.mutate({ hackathonId, catalogVisible })
          }
          label="Show the catalog to hackers"
        />
        <Toggle
          id={`store-open-${hackathonId}`}
          checked={saved.open}
          disabled={readOnly || update.isPending}
          readOnly={readOnly}
          onChange={(open) => update.mutate({ hackathonId, open })}
          label="Store is open"
        />
      </div>

      <form
        className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!locationChanged) return;
          update.mutate({ hackathonId, location: locationValue });
        }}
      >
        <div>
          <label htmlFor={`store-location-${hackathonId}`} className={fieldLabel}>
            Pickup location
          </label>
          <input
            id={`store-location-${hackathonId}`}
            type="text"
            maxLength={240}
            value={locationValue}
            onChange={(e) => setLocation(e.target.value)}
            disabled={readOnly}
            placeholder="Main hall, table 3"
            className={`min-h-11 ${input}`}
          />
        </div>
        <button
          type="submit"
          disabled={readOnly || !locationChanged || update.isPending}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={`min-h-11 ${btnSecondary}`}
        >
          {update.isPending ? "Saving…" : "Save location"}
        </button>
        <p className={`sm:col-span-2 -mt-1 ${fieldHint}`}>
          Hackers see this under the store on their Points tab. Leave it blank
          to hide it.
        </p>
      </form>

      {update.error && (
        <p
          role="alert"
          className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
        >
          {trpcErrorMessage(update.error, "Couldn't save store settings.")}
        </p>
      )}
    </div>
  );
}
