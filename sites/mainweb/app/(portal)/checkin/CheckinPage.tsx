"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { useEventCheckIn } from "@/components/portal/EventCheckIn";
import { trpc } from "@/lib/trpc";
import {
  body,
  btnPrimary,
  itemTitle,
  label,
  page,
  pageDek,
  pageTitle,
} from "@/components/portal/ui";

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

  const total = myStats?.totalEvents ?? 0;

  return (
    <main className={page}>
      {checkIn.modals}

      <header>
        <h1 className={pageTitle}>Check in to an event</h1>
        <p className={pageDek}>
          Scan the QR code shown at the event. Open to everyone, no membership
          needed.
        </p>
      </header>

      <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
        <h2 className={itemTitle}>At an event?</h2>
        <p className={`mt-2 max-w-xl ${body}`}>
          Point your camera at the event&apos;s QR code to record your
          attendance.
        </p>
        <button
          type="button"
          onClick={checkIn.openScanner}
          disabled={checkIn.scannerOpen}
          className={`mt-5 min-h-11 ${btnPrimary}`}
        >
          Open scanner
        </button>
      </section>

      <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
        <h2 className={label}>Your check-ins</h2>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-[40px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
            {total}
          </span>
          <span className={body}>{total === 1 ? "event" : "events"}</span>
        </p>
      </section>
    </main>
  );
}
