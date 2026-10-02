"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Check, Copy, Nfc, Printer } from "lucide-react";

/** Web NFC is Chrome on Android only and not in the TS DOM lib. */
type NdefWriter = {
  write: (msg: { records: { recordType: "url"; data: string }[] }) => Promise<void>;
};
declare global {
  interface Window {
    NDEFReader?: new () => NdefWriter;
  }
}

/** What a table's NFC tag holds: the judge page, opened on that table. */
const tableLink = (hackathonId: string, code: string) =>
  `${window.location.origin}/hackathons/${hackathonId}/judge?table=${encodeURIComponent(code)}`;

const noopSubscribe = () => () => {};

type WriteState = "writing" | "written" | "copied" | { error: string };

/**
 * The printable half of scan-to-start.
 *
 * One card per judgeable project, each carrying the code a judge scans when
 * they reach the table. Rendered to be printed and folded onto a desk — the
 * whole timing change is inert without something physical to scan.
 *
 * QR payload is the bare code, nothing else: the smaller the payload the
 * coarser the modules, and these get scanned in bad light across a crowded
 * room by whatever phone the judge happens to own.
 */
export function TableCards({ hackathonId }: { hackathonId: string }) {
  const { data: cards, isLoading } = trpc.judge.tableCards.useQuery({
    hackathonId,
  });
  const [images, setImages] = useState<Record<string, string>>({});
  const [writes, setWrites] = useState<Record<string, WriteState>>({});
  // False on the server and during hydration, then the real answer.
  const canWriteNfc = useSyncExternalStore(
    noopSubscribe,
    () => typeof window.NDEFReader === "function",
    () => false,
  );

  const setWrite = (id: string, state: WriteState) =>
    setWrites((prev) => ({ ...prev, [id]: state }));

  // Android Chrome: hold a blank tag to the back of the phone after pressing.
  const writeTag = async (id: string, code: string) => {
    if (!window.NDEFReader) return;
    setWrite(id, "writing");
    try {
      await new window.NDEFReader().write({
        records: [{ recordType: "url", data: tableLink(hackathonId, code) }],
      });
      setWrite(id, "written");
    } catch (e) {
      setWrite(id, {
        error: e instanceof Error ? e.message : "Could not write the tag.",
      });
    }
  };

  // iPhone or desktop: copy the link into an NFC writer app instead.
  const copyLink = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(tableLink(hackathonId, code));
      setWrite(id, "copied");
    } catch {
      setWrite(id, { error: "Could not copy. Select the link and copy it." });
    }
  };

  useEffect(() => {
    if (!cards) return;
    let cancelled = false;
    (async () => {
      const { default: QRCode } = await import("qrcode");

      // Encoded in parallel. Serially, a full event's worth of table cards
      // rendered one QR at a time while the organiser waited to print.
      const encoded = await Promise.all(
        cards.map(async (card) => [
          card.id,
          await QRCode.toDataURL(card.qrCode, {
            width: 420,
            margin: 1,
            // Black on white regardless of theme: a dark-mode QR printed on
            // white paper is a grey rectangle.
            color: { dark: "#000000", light: "#FFFFFF" },
          }),
        ] as const),
      );

      const next: Record<string, string> = Object.fromEntries(encoded);
      if (!cancelled) setImages(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [cards]);

  if (isLoading) {
    return (
      <p className="text-[var(--text-subtle)] font-mono text-center py-20 animate-pulse">
        Building table cards...
      </p>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <LiquidGlass className="p-12 text-center border-[var(--border-subtle)]">
        <h3 className="text-[var(--text-primary)] font-bold mb-1">
          No tables yet
        </h3>
        <p className="text-sm text-[var(--text-subtle)] font-mono">
          Sync submissions into judging first — each project gets a table number
          and a code at that point.
        </p>
      </LiquidGlass>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Table Cards
          </h2>
          <p className="text-sm font-mono text-[var(--text-subtle)]">
            {cards.length} card(s). Print and put one on each table — judges
            scan it to start scoring. For tap-to-start, stick an NFC tag on
            each card and write its table link to it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 bg-white/5 border border-[var(--border-subtle)] hover:bg-white/10 transition-colors rounded-none font-mono text-xs uppercase tracking-wider font-bold text-[var(--text-primary)] flex items-center gap-2"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.id}
            // break-inside-avoid so a card is never split across two sheets.
            className="bg-white text-black p-8 text-center break-inside-avoid border border-[var(--border-subtle)]"
          >
            <p className="text-5xl font-black tracking-tighter mb-1">
              {card.tableNumber}
            </p>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-5">
              {card.zone ? `Zone ${card.zone}` : "Table"}
            </p>
            {images[card.id] ? (
              // A data: URI generated in the browser — next/image has nothing
              // to optimise here and would only add a proxy hop.
              <img
                src={images[card.id]}
                alt={`QR code for table ${card.tableNumber}`}
                className="w-48 h-48 mx-auto"
              />
            ) : (
              <div className="w-48 h-48 mx-auto bg-neutral-100" />
            )}
            <p className="mt-5 text-lg font-bold leading-tight">{card.name}</p>
            {card.teamMembers ? (
              <p className="text-xs text-neutral-500 mt-1">
                {card.teamMembers}
              </p>
            ) : null}
            <p className="mt-4 text-[10px] font-mono uppercase tracking-widest text-neutral-400">
              Judges: tap or scan to begin
            </p>

            {/* Organiser-only: programming the tag. Not printed. */}
            <div className="mt-5 pt-4 border-t border-neutral-200 flex flex-wrap items-center justify-center gap-2 print:hidden">
              {canWriteNfc && (
                <button
                  type="button"
                  onClick={() => writeTag(card.id, card.qrCode)}
                  disabled={writes[card.id] === "writing"}
                  className="px-3 py-2 bg-black text-white text-[11px] font-mono uppercase tracking-wider font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  <Nfc className="w-4 h-4" />
                  {writes[card.id] === "writing" ? "Hold tag to phone…" : "Write NFC tag"}
                </button>
              )}
              <button
                type="button"
                onClick={() => copyLink(card.id, card.qrCode)}
                className="px-3 py-2 border border-neutral-300 text-neutral-700 text-[11px] font-mono uppercase tracking-wider font-bold flex items-center gap-2 hover:bg-neutral-100"
              >
                <Copy className="w-4 h-4" /> Copy link
              </button>
              {(writes[card.id] === "written" || writes[card.id] === "copied") && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-green-700">
                  <Check className="w-4 h-4" />
                  {writes[card.id] === "written" ? "Tag written" : "Copied"}
                </span>
              )}
              {typeof writes[card.id] === "object" && (
                <p role="alert" className="basis-full text-[11px] font-mono text-red-700">
                  {(writes[card.id] as { error: string }).error}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
