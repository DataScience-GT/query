"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import {
  body,
  fieldLabel,
  input,
  kicker,
  meta,
  page,
  pageTitle,
} from "@query/ui/classes";
import { ScanAccess } from "@/components/portal/ScanAccess";
import { DiscordCard } from "@/components/hackathon/DiscordCard";

// Only scanners use the desk, so the page ships without it. It starts loading
// as soon as the role is known, alongside the hackathon list it waits on.
const loadScannerTab = () =>
  import("@/components/admin/hackathons/ScannerTab").then((m) => m.ScannerTab);
const ScannerTab = dynamic(loadScannerTab, {
  loading: () => <p className={meta}>Loading scanner…</p>,
});

/**
 * Hackathon badge check-in.
 *
 * Club meetings are a different desk (/scan/club). Volunteers are not admins,
 * so this stays outside /admin; mixing both modes here is what put club
 * events inside the hackathon.
 */
export default function ScanPage() {
  const { data: portalContext } = usePortalContext();
  const isScanner = !!portalContext?.isScanner;
  useEffect(() => {
    if (isScanner) void loadScannerTab();
  }, [isScanner]);
  // null until the volunteer picks one, so a single live edition can stand in.
  const [pickedId, setPickedId] = useState<string | null>(null);

  const { data: hackathons, isLoading } = trpc.hackathon.list.useQuery(
    {},
    { enabled: isScanner },
  );

  // The desk is for the edition running now. With exactly one, there is
  // nothing to choose.
  const live = hackathons?.filter((h) => h.status === "in_progress") ?? [];
  const onlyLive = live.length === 1 ? live[0] : undefined;
  const hackathonId = pickedId ?? onlyLive?.id ?? "";
  const edition = hackathons?.find((h) => h.id === hackathonId);
  // A lone live edition is already chosen; the list only matters when there is
  // a choice to make. Admins reach other editions from the Scanner tab.
  const showPicker = !isLoading && (!onlyLive || pickedId !== null);

  return (
    <ScanAccess>
      <main className={page}>
        <header>
          <p className={kicker}>{edition?.name ?? "Hackathon staff"}</p>
          <h1 className={`mt-1 ${pageTitle}`}>Check-in desk</h1>
        </header>

        {/* The card shows itself only to volunteers; empty, the wrapper hides. */}
        <div className="mt-6 empty:hidden">
          <DiscordCard />
        </div>

        {showPicker && (
          <div className="mt-6 max-w-md">
            <label htmlFor="scan-hackathon" className={fieldLabel}>
              Hackathon
            </label>
            <select
              id="scan-hackathon"
              value={hackathonId}
              onChange={(e) => setPickedId(e.target.value)}
              className={`min-h-11 ${input}`}
            >
              <option value="">Select a hackathon…</option>
              {hackathons?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-6">
          {hackathonId ? (
            // An event picked for one edition means nothing in another.
            <ScannerTab key={hackathonId} hackathonId={hackathonId} />
          ) : isLoading ? (
            <p className={meta}>Loading hackathons…</p>
          ) : (
            <p className={body}>
              Choose a hackathon above to start scanning.
            </p>
          )}
        </div>
      </main>
    </ScanAccess>
  );
}
