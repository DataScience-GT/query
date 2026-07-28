"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Clock } from "lucide-react";

/**
 * Registration status + deadline controls for one hackathon.
 * Extracted from AttendeesTab; owns its own mutation so the parent stays lean.
 */
export function RegistrationControls({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();
  const { data: hackathon } = trpc.hackathon.getById.useQuery({
    id: hackathonId,
  });

  const updateHackathon = trpc.hackathon.update.useMutation({
    onSuccess: () => {
      utils.hackathon.getById.invalidate({ id: hackathonId });
      utils.hackathon.listAll.invalidate();
    },
  });

  const regDeadline = hackathon?.registrationDeadline
    ? new Date(hackathon.registrationDeadline)
    : null;
  const deadlinePassed = !!regDeadline && regDeadline < new Date();

  return (
    <LiquidGlass className="p-6 border-[var(--border-subtle)] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Registration Controls
          </h3>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-wider">
                Status:
              </span>
              <span
                className={`px-2 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider ${hackathon?.status === "open" ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20"}`}
              >
                {hackathon?.status || "unknown"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-wider">
                Deadline:
              </span>
              <span
                className={`text-xs font-mono font-bold ${deadlinePassed ? "text-red-400" : "text-amber-400"}`}
              >
                {regDeadline ? regDeadline.toLocaleString() : "No deadline set"}
                {deadlinePassed ? " (PASSED)" : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {hackathon?.status !== "open" && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() =>
                  updateHackathon.mutate({
                    id: hackathonId,
                    status: "open",
                    // A passed deadline blocks signups even when status is
                    // open, so reopening must also push the deadline out.
                    ...(deadlinePassed && hackathon?.endDate
                      ? { registrationDeadline: new Date(hackathon.endDate) }
                      : {}),
                  })
                }
                disabled={updateHackathon.isPending}
                className="px-4 py-2.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider rounded-none hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                {deadlinePassed ? "Reopen Registration" : "Open Registration"}
              </button>
              {deadlinePassed && (
                <span className="text-[10px] font-mono text-[var(--text-subtle)]">
                  Also extends deadline to event end
                </span>
              )}
            </div>
          )}
          {hackathon?.status === "open" && (
            <button
              type="button"
              onClick={() =>
                updateHackathon.mutate({ id: hackathonId, status: "closed" })
              }
              disabled={updateHackathon.isPending}
              className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider rounded-none hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Close Registration
            </button>
          )}
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              aria-label="Registration deadline"
              defaultValue={
                regDeadline ? regDeadline.toISOString().slice(0, 16) : ""
              }
              onChange={(e) => {
                if (e.target.value) {
                  updateHackathon.mutate({
                    id: hackathonId,
                    registrationDeadline: new Date(e.target.value),
                  });
                }
              }}
              className="px-3 py-2 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-xs font-mono focus:border-accent/50 focus:outline-none transition-colors [color-scheme:dark]"
            />
          </div>
        </div>
      </div>
    </LiquidGlass>
  );
}
