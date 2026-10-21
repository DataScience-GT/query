"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { useIsClient } from "@/lib/use-is-client";
import {
  body,
  btnPrimary,
  btnSecondary,
  meta,
  object,
  pageDek,
} from "@/components/portal/ui";

type Room = RouterOutputs["judging"]["admin"]["listRooms"]["rooms"][number];

// Every live room and table QR, ready to print for each door or each table's
// judges. The portal's sidebar and header would print too, so the sheet
// that prints is a copy mounted straight under <body>, and the print
// stylesheet hides everything else. Paper is white whatever the screen theme.
const PRINT_CSS = `
@media print {
  @page { margin: 16mm; }
  body { background: #ffffff !important; }
  body > :not(.judging-qr-print) { display: none !important; }
  .judging-qr-print { display: block !important; color: #000000; }
}
`;

export default function RoomQrSheetPage() {
  const params = useParams<{ hackathonId: string }>();
  const hackathonId = params?.hackathonId ?? "";
  const isClient = useIsClient();

  const overview = trpc.judging.admin.overview.useQuery(
    { hackathonId },
    { enabled: !!hackathonId },
  );
  const rooms = trpc.judging.admin.listRooms.useQuery(
    { hackathonId },
    { enabled: !!hackathonId },
  );

  const active = (rooms.data?.rooms ?? []).filter((r) => !r.archivedAt);
  const printable = active.filter((r) => r.link);
  const missing = active.filter((r) => !r.link);
  const edition = overview.data?.hackathon.name ?? "";

  return (
    <div className="max-w-4xl mx-auto">
      <style>{PRINT_CSS}</style>
      <Link
        href={`/admin/judging/${hackathonId}#rooms`}
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← Rooms
      </Link>
      <header className="mt-4 mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
            Judging QR codes
          </h1>
          <p className={pageDek}>
            One room or table per page. Tape each room&apos;s sheet by its door,
            and hand each table&apos;s to its judges rather than leaving it on
            the table: teams sit there, and anyone who scans a code can judge.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={printable.length === 0}
          className={`${btnPrimary} shrink-0`}
        >
          <Printer size={16} strokeWidth={1.75} aria-hidden="true" />
          Print {printable.length === 1 ? "1 sheet" : `${printable.length} sheets`}
        </button>
      </header>

      {rooms.isLoading ? (
        <p className={body}>Loading rooms and tables…</p>
      ) : rooms.isError ? (
        <div className="space-y-4">
          <p className={body}>
            {trpcErrorMessage(
              rooms.error,
              "Could not load the rooms and tables.",
            )}
          </p>
          <button
            type="button"
            onClick={() => rooms.refetch()}
            className={btnSecondary}
          >
            Try again
          </button>
        </div>
      ) : printable.length === 0 ? (
        <p className={body}>
          No room or table has a QR link yet. Generate links on{" "}
          <Link
            href={`/admin/judging/${hackathonId}#rooms`}
            className="font-semibold text-[var(--text-primary)] underline decoration-accent decoration-2 underline-offset-[5px]"
          >
            Rooms
          </Link>
          , then come back.
        </p>
      ) : (
        <>
          {missing.length > 0 && (
            <p className={`mb-6 ${meta}`}>
              Not on the sheet, no QR link yet:{" "}
              {missing.map((r) => r.name).join(", ")}.
            </p>
          )}
          <ul className="grid gap-6 sm:grid-cols-2">
            {printable.map((room) => (
              <li key={room.id} className={`${object} p-6`}>
                <Sheet room={room} edition={edition} size={200} />
              </li>
            ))}
          </ul>
        </>
      )}

      {isClient &&
        printable.length > 0 &&
        createPortal(
          <div className="judging-qr-print hidden">
            {printable.map((room) => (
              <section
                key={room.id}
                className="break-after-page break-inside-avoid pt-8 text-center"
              >
                <Sheet room={room} edition={edition} size={320} print />
              </section>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function Sheet({
  room,
  edition,
  size,
  print,
}: {
  room: Room;
  edition: string;
  size: number;
  print?: boolean;
}) {
  if (!room.link) return null;
  const where = [room.buildingName, room.challengeLabel]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`flex flex-col ${print ? "items-center" : ""}`}>
      <p
        className={
          print
            ? "text-[14pt]"
            : "text-[13px] font-semibold text-[var(--text-subtle)]"
        }
      >
        {edition ? `${edition} judging` : "Judging"}
      </p>
      <p
        className={`font-[family-name:var(--font-display)] font-semibold leading-tight ${
          print
            ? "mt-2 text-[40pt]"
            : "mt-1 text-[28px] text-[var(--text-primary)]"
        }`}
      >
        {room.name}
      </p>
      {where && (
        <p className={print ? "mt-1 text-[16pt]" : "mt-1 text-[15px] text-[var(--text-muted)]"}>
          {where}
        </p>
      )}
      {/* literal white: must match the QR bgColor below in both themes */}
      <div
        className={`w-fit rounded-[var(--radius-sm)] bg-[#ffffff] p-3 ${print ? "mt-10" : "mt-5"}`}
      >
        <QRCodeSVG
          value={room.link.url}
          size={size}
          level="M"
          fgColor="#000000"
          bgColor="#ffffff"
          title={`Guest judge QR code for ${room.name}`}
        />
      </div>
      <p className={print ? "mt-10 text-[14pt]" : `mt-4 ${meta}`}>
        Judges: scan with your phone camera to join this {room.kind}.
      </p>
      <p className={print ? "mt-2 text-[12pt]" : `mt-1 ${meta}`}>
        Club judges: sign in on your phone before scanning.
      </p>
      <p
        className={`break-all font-[family-name:var(--font-mono)] ${
          print ? "mt-2 text-[9pt]" : "mt-1 text-[12px] text-[var(--text-subtle)]"
        }`}
      >
        {room.link.url}
      </p>
    </div>
  );
}
