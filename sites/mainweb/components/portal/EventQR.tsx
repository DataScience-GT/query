"use client";

import { useState } from "react";
import { QRCodeModal } from "@/components/portal/QRCodeModal";
import { trpc } from "@/lib/trpc";

type QREvent = {
  id: string;
  title: string;
  qrCode: string;
  checkInEnabled: boolean;
  currentCheckIns: number;
  maxCheckIns: number | null;
};

/**
 * The door QR for an event: render it, download it, regenerate it. Shared by
 * the Club Hub and the bootcamp admin page, which manage different events
 * through the same code.
 *
 * Render `modal` somewhere in the page and call `show(event)` from a button.
 */
export function useEventQR() {
  const utils = trpc.useUtils();

  const [shownEvent, setShownEvent] = useState<QREvent | null>(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState("");
  // The QR encoder is fetched on demand, so the press has to say it is working.
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const show = async (event: QREvent) => {
    setGeneratingFor(event.qrCode);
    try {
      // ~240KB, and only needed once somebody asks to see a QR. Loading it up
      // front put it in the bundle of the page admins open most.
      const { default: QRCode } = await import("qrcode");
      const url = await QRCode.toDataURL(event.qrCode, {
        width: 400,
        margin: 3,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrCodeDataURL(url);
      setShownEvent(event);
    } catch (err) {
      console.error("Error generating QR code:", err);
    } finally {
      setGeneratingFor(null);
    }
  };

  const regenerateQRMutation = trpc.events.regenerateQR.useMutation({
    onSuccess: (updatedEvent) => {
      utils.events.listAll.invalidate();
      utils.bootcamp.attendance.invalidate();
      void show(updatedEvent);
    },
  });

  const download = () => {
    const link = document.createElement("a");
    link.download = `${shownEvent?.title || "event"}-qr.png`;
    link.href = qrCodeDataURL;
    link.click();
  };

  const modal = shownEvent ? (
    <QRCodeModal
      event={shownEvent}
      qrCodeDataURL={qrCodeDataURL}
      onClose={() => setShownEvent(null)}
      onDownload={download}
      onRegenerate={() =>
        regenerateQRMutation.mutate({ eventId: shownEvent.id })
      }
      isRegenerating={regenerateQRMutation.isPending}
    />
  ) : null;

  return {
    show,
    /** The qrCode currently being encoded, for a button's busy state. */
    generatingFor,
    /** Close the QR, e.g. when its event is deleted. */
    hide: () => setShownEvent(null),
    modal,
  };
}
