"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "./LiquidGlass";

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
    <LiquidGlass className="p-8 flex flex-col items-center text-center">
      <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight mb-2">
        My Member Pass
      </h3>
      <p className="text-xs text-[var(--text-primary)]/40 mb-6 leading-relaxed max-w-xs">
        Show this at the door and an officer scans it. You can still scan the
        event&apos;s own QR yourself instead.
      </p>

      {pass.isLoading ? (
        <div className="w-[212px] h-[212px] bg-white/[0.02] border border-[var(--border-subtle)]" />
      ) : code ? (
        <>
          {/* literal white: the QR must stay readable in both themes */}
          <div className="p-4 bg-[#ffffff] rounded-none">
            <QRCodeSVG
              value={code}
              size={180}
              level="H"
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
          {name && (
            <p className="mt-4 text-sm text-[var(--text-primary)] font-medium">
              {name}
            </p>
          )}

          {confirmRotate ? (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-mono text-amber-400 max-w-xs">
                The old pass stops working immediately.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => rotate.mutate()}
                  disabled={rotate.isPending}
                  className="px-4 py-2 border border-red-500/20 text-red-400 text-[10px] font-mono uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  {rotate.isPending ? "Rotating…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRotate(false)}
                  className="px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] font-mono uppercase tracking-widest hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRotate(true)}
              className="mt-4 text-[10px] font-mono uppercase tracking-widest text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
            >
              Rotate pass
            </button>
          )}

          {rotate.error && (
            <p role="alert" className="mt-3 text-xs font-mono text-red-400">
              {rotate.error.message}
            </p>
          )}
        </>
      ) : (
        <div className="w-[212px] h-[212px] border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center px-6">
          <p className="text-xs text-[var(--text-muted)]">
            Your pass appears once you have a member profile.
          </p>
        </div>
      )}
    </LiquidGlass>
  );
}
