"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { ScannerTab } from "@/components/admin/hackathons/ScannerTab";
import { ClubScannerTab } from "@/components/portal/ClubScannerTab";

/**
 * The check-in desk.
 *
 * Deliberately outside the /admin segment. AdminLayout gates on
 * `portalContext.isAdmin`, which rejects volunteers by design — so the only
 * scanning UI in the product lived behind a door the scanner tier could not
 * open. The alternative was relaxing that gate and then re-scoping every admin
 * tab behind it, which is a much wider blast radius for the same outcome.
 *
 * Full staff can use this too: isScanner accepts any active admins row, so a
 * volunteer and an organiser get the same screen.
 */
export default function ScanPage() {
  const { status } = useSession();
  const router = useRouter();
  const { data: portalContext, isLoading } = usePortalContext();
  const [mode, setMode] = useState<"hackathon" | "club">("hackathon");
  const [hackathonId, setHackathonId] = useState("");
  const [clubEventId, setClubEventId] = useState("");

  // Public procedures, so a volunteer can read them. The listAll variants are
  // isAdmin and would reject exactly the people this page exists for.
  const { data: hackathons } = trpc.hackathon.list.useQuery(
    {},
    { enabled: !!portalContext?.isScanner },
  );
  const { data: clubEvents } = trpc.events.list.useQuery(undefined, {
    enabled: !!portalContext?.isScanner,
  });

  if (status === "loading" || isLoading) {
    return <LoadingScreen message="Checking access…" />;
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  if (!portalContext?.isScanner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <LiquidGlass className="p-12 max-w-md text-center">
          <h1 className="text-2xl font-black text-[var(--text-primary)] mb-4 uppercase tracking-tight">
            Not a Scanner
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-mono mb-8">
            This is the event check-in desk. Ask an organiser to add you as
            event staff.
          </p>
          <Link
            href="/dashboard"
            className="px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
          >
            Back to Dashboard
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter mb-1">
          Check-In <span className="text-accent italic">Desk</span>
        </h1>
        <p className="text-sm font-mono text-[var(--text-subtle)]">
          Scan attendee badges into an event.
        </p>
      </div>

      {/* The two halves scan opposite things: a hackathon badge encodes the
          participant, a club pass encodes the member. */}
      <div className="mb-6 flex gap-2">
        {(["hackathon", "club"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-5 py-2 border text-xs font-mono uppercase tracking-widest transition-colors ${
              mode === m
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-[var(--border-subtle)] text-[var(--text-subtle)] hover:bg-white/5"
            }`}
          >
            {m === "hackathon" ? "Hackathon" : "Club Event"}
          </button>
        ))}
      </div>

      {mode === "hackathon" ? (
        <>
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
        </>
      ) : (
        <>
          <div className="mb-6">
            <label
              htmlFor="scan-club-event"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Club Event
            </label>
            <select
              id="scan-club-event"
              value={clubEventId}
              onChange={(e) => setClubEventId(e.target.value)}
              className="w-full min-h-11 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
            >
              <option value="">Select an event…</option>
              {clubEvents?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>

          {clubEventId ? (
            <ClubScannerTab eventId={clubEventId} />
          ) : (
            <LiquidGlass className="p-12 text-center border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--text-subtle)] font-mono">
                Choose a club event above to start scanning.
              </p>
            </LiquidGlass>
          )}
        </>
      )}
    </div>
  );
}
