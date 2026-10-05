"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { body, btnSecondary, meta, sectionTitle } from "@/components/portal/ui";
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
  const readOnly = useReadOnly();
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
      <p className={`py-20 ${meta}`}>Building table cards…</p>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <section>
        <h2 className={sectionTitle}>No tables yet</h2>
        <p className={`mt-1 max-w-xl ${body}`}>
          Sync submissions into judging first — each project gets a table number
          and a code at that point.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 print:hidden">
        <div>
          <h2 className={sectionTitle}>Table cards</h2>
          <p className={`mt-1 max-w-2xl ${body}`}>
            {cards.length} card(s). Print and put one on each table — judges
            scan it to start scoring. For tap-to-start, stick an NFC tag on
            each card and write its table link to it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className={`shrink-0 ${btnSecondary}`}
        >
          <Printer className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> Print
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.id}
            // break-inside-avoid so a card is never split across two sheets.
            className="rounded-[var(--radius-md)] bg-white text-black p-8 text-center break-inside-avoid border border-[var(--border-subtle)]"
          >
            <p className="font-[family-name:var(--font-display)] text-5xl font-semibold tabular-nums mb-1">
              {card.tableNumber}
            </p>
            <p className="text-[13px] text-neutral-500 mb-5">
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
            <p className="mt-5 font-[family-name:var(--font-display)] text-[22px] font-semibold leading-snug">{card.name}</p>
            {card.teamMembers ? (
              <p className="text-[13px] text-neutral-500 mt-1">
                {card.teamMembers}
              </p>
            ) : null}
            <p className="mt-4 text-[13px] text-neutral-500">
              Judges: tap or scan to begin
            </p>

            {/* Organiser-only: programming the tag. Not printed. */}
            <div className="mt-5 pt-4 border-t border-neutral-200 flex flex-wrap items-center justify-center gap-2 print:hidden">
              {canWriteNfc && (
                <button
                  type="button"
                  onClick={() => writeTag(card.id, card.qrCode)}
                  disabled={readOnly || writes[card.id] === "writing"}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-black px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  <Nfc className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  {writes[card.id] === "writing" ? "Hold tag to phone…" : "Write NFC tag"}
                </button>
              )}
              <button
                type="button"
                onClick={() => copyLink(card.id, card.qrCode)}
                className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-neutral-300 px-3 py-2 text-[13px] font-semibold text-neutral-800 hover:bg-neutral-100"
              >
                <Copy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> Copy link
              </button>
              {(writes[card.id] === "written" || writes[card.id] === "copied") && (
                <span className="flex items-center gap-1 text-[13px] text-neutral-700">
                  <Check className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  {writes[card.id] === "written" ? "Tag written" : "Copied"}
                </span>
              )}
              {typeof writes[card.id] === "object" && (
                <p role="alert" className="basis-full text-[13px] text-red-700">
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
