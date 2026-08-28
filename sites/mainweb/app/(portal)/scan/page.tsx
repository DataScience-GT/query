"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
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
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-[10px] font-mono text-accent/80 uppercase tracking-[0.2em] mb-2">
            Hackathon
          </p>
          <h1 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter mb-1">
            Check-In <span className="text-accent italic">Desk</span>
          </h1>
          <p className="text-sm font-mono text-[var(--text-subtle)]">
            Scan participant badges into this edition&apos;s workshops, meals,
            and ceremonies.
          </p>
        </div>

        <div className="mb-6">
          <label
            htmlFor="scan-hackathon"
            className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
          >
            Hackathon
          </label>
          <select
            id="scan-hackathon"
            value={hackathonId}
            onChange={(e) => setHackathonId(e.target.value)}
            className="w-full min-h-11 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
          >
            <option value="">Select a hackathon…</option>
            {hackathons?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>

        {hackathonId ? (
          <ScannerTab hackathonId={hackathonId} />
        ) : (
          <LiquidGlass className="p-12 text-center border-[var(--border-subtle)]">
            <p className="text-sm text-[var(--text-subtle)] font-mono">
              Choose a hackathon above to start scanning.
            </p>
          </LiquidGlass>
        )}
      </div>
    </ScanAccess>
  );
}
