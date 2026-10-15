"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import { useIsClient } from "@/lib/use-is-client";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { body, btnSecondary, status, textLink } from "@/components/portal/ui";
import {
  pointsLabel,
  venueRange,
  venueTime,
} from "@/components/hackathon/points/format";

// Self check-in opens this long before the start (services/points.ts).
const LEAD_MS = 15 * 60 * 1000;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

// The portal's sidebar sits under this screen, and browsers drop background
// colours when printing, so a printout would show it through. Printing keeps
// only the door screen.
const PRINT_ONLY_THIS = `@media print {
  body * { visibility: hidden; }
  #event-door-screen, #event-door-screen * { visibility: visible; }
  #event-door-screen { position: absolute; inset: 0; overflow: visible; }
}`;

/**
 * The door screen for one event: its code, very large, and the poster QR that
 * opens the hacker's check-in with the code filled in. Meant for a projector
 * or a printout, so it covers the portal chrome. Polls so a rotation from the
 * Events tab replaces what is on the wall within seconds.
 */
export default function EventCodeDisplayPage() {
  const params = useParams();
  const hackathonParam = decodeHackathonParam(first(params?.id));
  const eventId = first(params?.eventId);
  const isClient = useIsClient();

  const hackathon = trpc.hackathon.getById.useQuery({ id: hackathonParam });
  const display = trpc.hackathon.getEventCheckInCode.useQuery(
    { hackathonId: hackathon.data?.id ?? "", eventId },
    { enabled: !!hackathon.data, refetchInterval: 10_000 },
  );

  // Back to the Events tab the code was made on, not the default tab.
  const backHref = `/admin/hackathons/${hackathonParam}#events`;

  if (hackathon.isLoading || (hackathon.data && display.isLoading)) {
    return <LoadingScreen message="Loading the door screen…" />;
  }

  const event = display.data;
  if (!event) {
    const error = hackathon.error ?? display.error;
    return (
      <div className="mx-auto max-w-md py-16">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold text-[var(--text-primary)]">
          Door screen unavailable
        </h1>
        <p className={`mt-3 ${body}`}>
          {trpcErrorMessage(error, "This event could not be found.")}
        </p>
        <Link href={backHref} className={`mt-6 ${textLink}`}>
          Back to the dashboard
        </Link>
      </div>
    );
  }

  // The last poll's time, not the render's: it moves every 10s with the poll
  // and keeps the render pure.
  const now = display.dataUpdatedAt;
  const opensAt = new Date(event.startTime).getTime() - LEAD_MS;
  const phase =
    now < opensAt
      ? "early"
      : now > new Date(event.endTime).getTime()
        ? "ended"
        : "open";

  const code = event.checkInCode;
  const checkInUrl =
    code && isClient
      ? `${window.location.origin}/hackathons/${event.hackathonId}/checkin?code=${code}`
      : null;

  return (
    // Paper is white and ink is black whatever the theme, so the tokens are
    // redefined for print rather than every element getting a print colour.
    <div
      id="event-door-screen"
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg-primary)] text-[var(--text-primary)] print:[--bg-primary:#ffffff] print:[--text-primary:#000000] print:[--text-secondary:#000000] print:[--text-muted:#333333]"
    >
      <style>{PRINT_ONLY_THIS}</style>
      <div className="flex min-h-full flex-col px-6 py-6 md:px-12 md:py-10">
        <nav className="flex items-center justify-between gap-4 print:hidden">
          <Link href={backHref} className={textLink}>
            Back to the dashboard
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className={btnSecondary}
          >
            <Printer size={16} strokeWidth={1.75} aria-hidden="true" />
            Print
          </button>
        </nav>

        <main className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-[clamp(1rem,2vw,1.75rem)] tabular-nums text-[var(--text-muted)]">
            {venueRange(event.startTime, event.endTime)} · {event.location}
          </p>
          <h1 className="mt-2 max-w-5xl text-balance font-[family-name:var(--font-display)] text-[clamp(2.25rem,6vw,5rem)] font-semibold leading-[1.02] tracking-[-0.025em] text-[var(--text-primary)]">
            {event.name}
          </h1>

          {code ? (
            <div className="mt-[5vh] flex flex-col items-center gap-[5vh] lg:flex-row lg:gap-[6vw]">
              <div>
                <p className="text-[clamp(1rem,1.8vw,1.5rem)] font-medium text-[var(--text-muted)]">
                  Event code
                </p>
                <p
                  aria-label={code.split("").join(" ")}
                  className="mt-2 whitespace-nowrap font-mono text-[clamp(4rem,15vw,13rem)] font-semibold leading-none tracking-[0.06em] tabular-nums text-[var(--text-primary)]"
                >
                  {code.slice(0, 3)}
                  <span className="ml-[0.3em]">{code.slice(3)}</span>
                </p>
                <p className="mx-auto mt-4 max-w-xl text-[clamp(1rem,1.6vw,1.375rem)] text-[var(--text-secondary)]">
                  Type it on the Points tab of your hackathon page, or scan the
                  QR with your phone camera.
                </p>
              </div>
              {checkInUrl && (
                /* literal white: the QR needs its quiet zone in both themes */
                <div className="rounded-[var(--radius-sm)] bg-[#ffffff] p-[clamp(0.75rem,1.5vw,1.5rem)]">
                  <QRCodeSVG
                    value={checkInUrl}
                    size={512}
                    level="M"
                    fgColor="#000000"
                    bgColor="#ffffff"
                    title={`Check in to ${event.name}`}
                    className="h-auto w-[min(70vw,42vh)] lg:w-[min(32vw,48vh)]"
                  />
                </div>
              )}
            </div>
          ) : (
            <p className={`mt-10 max-w-xl ${body}`}>
              This event has no check-in code yet. Make one from the event on
              the Events tab; it appears here within ten seconds.
            </p>
          )}

          <p className="mt-[5vh] flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[clamp(0.9rem,1.4vw,1.25rem)]">
            {event.points > 0 && (
              <span className="text-[var(--text-primary)]">
                Worth {pointsLabel(event.points)}
              </span>
            )}
            {!event.selfCheckIn ? (
              <span className={`${status("warning")} print:hidden`}>
                Self check-in is off, so this code is refused. Turn it on in
                the Events tab.
              </span>
            ) : phase === "early" ? (
              <span className={status("neutral")}>
                Opens at {venueTime(new Date(opensAt))}
              </span>
            ) : phase === "ended" ? (
              <span className={status("danger")}>
                This event has ended; the code no longer works.
              </span>
            ) : (
              <span className={`${status("success")} print:hidden`}>
                Taking codes until {venueTime(event.endTime)}
              </span>
            )}
          </p>
        </main>
      </div>
    </div>
  );
}
