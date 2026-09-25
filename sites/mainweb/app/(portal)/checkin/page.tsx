"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { QrCode, Search } from "lucide-react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { useEventCheckIn } from "@/components/portal/EventCheckIn";
import { trpc } from "@/lib/trpc";

/**
 * Event check-in for anyone signed in. The Club Portal has the same scanner,
 * but it is a members' page; attendance is not, so this route takes everyone.
 */
export default function CheckInPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const checkIn = useEventCheckIn();

  const { data: myStats } = trpc.events.myStats.useQuery(undefined, {
    enabled: !!session,
  });

  // Straight back here after signing in: the QR is on the wall in front of
  // them, and a detour through the dashboard loses it.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent("/checkin")}`);
    }
  }, [status, router]);

  if (status === "loading" || !session) {
    return <LoadingScreen message="Loading check-in…" />;
  }

  return (
    <div className="relative z-10 max-w-3xl mx-auto px-6 pt-12 md:pt-20 pb-20">
      {checkIn.modals}

      <div className="mb-8">
        <p className="text-[10px] font-mono text-accent/80 uppercase tracking-[0.2em] mb-2">
          Events
        </p>
        <h1 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter mb-1">
          Event <span className="text-accent italic">Check-In</span>
        </h1>
        <p className="text-sm font-mono text-[var(--text-subtle)]">
          Scan the QR code shown at the event. Open to everyone, no membership
          needed.
        </p>
      </div>

      <div className="rounded-none border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-8 md:p-10 shadow-xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-none bg-accent/10 border border-accent/30 flex items-center justify-center">
            <QrCode className="w-6 h-6 text-accent" />
          </div>
          <div>
            <p className="text-[var(--text-primary)] font-bold">At an event?</p>
            <p className="text-sm text-[var(--text-subtle)]">
              Point your camera at the event&apos;s QR code to record your
              attendance.
            </p>
          </div>
        </div>

        <button
          onClick={checkIn.openScanner}
          disabled={checkIn.scannerOpen}
          className="min-h-11 px-8 py-4 bg-gradient-to-r from-accent to-accent rounded-none text-[var(--text-primary)] font-bold tracking-widest text-sm uppercase transition-ui hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
        >
          <Search className="w-4 h-4" />
          Launch Scanner
        </button>
      </div>

      <div className="mt-6 rounded-none border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-8 shadow-xl">
        <h2 className="text-[var(--text-subtle)] font-mono text-xs uppercase tracking-widest mb-2">
          Your Check-Ins
        </h2>
        <div className="flex items-end gap-4">
          <span className="text-6xl font-black text-[var(--text-primary)] leading-none">
            {myStats?.totalEvents ?? 0}
          </span>
          <span className="text-accent font-bold mb-1">Events</span>
        </div>
      </div>
    </div>
  );
}
