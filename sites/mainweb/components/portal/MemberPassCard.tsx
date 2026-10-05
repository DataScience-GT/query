"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { trpc } from "@/lib/trpc";
import { btnDanger, btnSecondary, itemTitle, meta, object } from "./ui";

/** The member's own pass, for an officer to scan at a club event door. */
export function MemberPassCard() {
  const utils = trpc.useUtils();
  const [confirmRotate, setConfirmRotate] = useState(false);

  const pass = trpc.member.myPass.useQuery();
  const rotate = trpc.member.rotatePass.useMutation({
    onSuccess: async () => {
      setConfirmRotate(false);
      await utils.member.myPass.invalidate();
    },
  });

  const code = pass.data?.passCode;
  const name = pass.data
    ? `${pass.data.firstName} ${pass.data.lastName}`.trim()
    : null;

  return (
    <div className={`${object} p-6 flex flex-col items-center text-center`}>
      <h3 className={itemTitle}>Member pass</h3>
      <p className={`${meta} mt-1.5 mb-5 leading-relaxed max-w-xs`}>
        Show this at the door and an officer scans it. You can still scan the
        event&apos;s own QR yourself instead.
      </p>

      {pass.isLoading ? (
        <div className="w-[212px] h-[212px] rounded-[var(--radius-sm)] bg-[var(--bg-secondary)]" />
      ) : code ? (
        <>
          {/* literal white: the QR must stay readable in both themes */}
          <div className="p-4 bg-[#ffffff] rounded-[var(--radius-sm)]">
            <QRCodeSVG
              value={code}
              size={180}
              level="H"
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
          {name && (
            <p className="mt-4 text-[15px] font-semibold text-[var(--text-primary)]">
              {name}
            </p>
          )}

          {confirmRotate ? (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] text-[var(--warning)] max-w-xs">
                The old pass stops working immediately.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => rotate.mutate()}
                  disabled={rotate.isPending}
                  className={btnDanger}
                >
                  {rotate.isPending ? "Rotating…" : "Rotate pass"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRotate(false)}
                  className={btnSecondary}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRotate(true)}
              className="mt-4 text-[13px] text-[var(--text-subtle)] underline underline-offset-4 hover:text-[var(--text-primary)] transition-colors"
            >
              Rotate pass
            </button>
          )}

          {rotate.error && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
              {rotate.error.message}
            </p>
          )}
        </>
      ) : (
        <p className="text-[15px] text-[var(--text-muted)] max-w-xs">
          Your pass appears here once you have a member profile.
        </p>
      )}
    </div>
  );
}
