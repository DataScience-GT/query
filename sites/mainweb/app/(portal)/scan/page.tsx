"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import {
  body,
  fieldLabel,
  input,
  kicker,
  page,
  pageDek,
  pageTitle,
} from "@/components/portal/ui";
import { ScanAccess } from "@/components/portal/ScanAccess";
import { ScannerTab } from "@/components/admin/hackathons/ScannerTab";

/**
 * Hackathon badge check-in.
 *
 * Club meetings are a different desk (/scan/club). Volunteers are not admins,
 * so this stays outside /admin; mixing both modes here is what put club
 * events inside the hackathon.
 */
export default function ScanPage() {
  const { data: portalContext } = usePortalContext();
  const [hackathonId, setHackathonId] = useState("");

  const { data: hackathons } = trpc.hackathon.list.useQuery(
    {},
    { enabled: !!portalContext?.isScanner },
  );

  return (
    <ScanAccess>
      <main className={page}>
        <header>
          <p className={kicker}>Hackathon staff</p>
          <h1 className={`mt-1 ${pageTitle}`}>Hackathon check-in desk</h1>
          <p className={pageDek}>
            Scan participant badges into this edition&apos;s workshops, meals
            and ceremonies.
          </p>
        </header>

        <div className="mt-8 max-w-md">
          <label htmlFor="scan-hackathon" className={fieldLabel}>
            Hackathon
          </label>
          <select
            id="scan-hackathon"
            value={hackathonId}
            onChange={(e) => setHackathonId(e.target.value)}
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

        <div className="mt-8 border-t border-[var(--border-subtle)] pt-8">
          {hackathonId ? (
            <ScannerTab hackathonId={hackathonId} />
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
