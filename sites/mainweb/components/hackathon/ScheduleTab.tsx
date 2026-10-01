"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { QRCodeSVG } from "qrcode.react";
import { Calendar, Lock, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/hackathon/StatusBadge";

export function ScheduleTab({
  hackathonId,
  isRegistered,
}: {
  hackathonId: string;
  isRegistered: boolean;
}) {
  const { data: events, isLoading: eventsLoading } =
    trpc.hackathon.getEvents.useQuery({ hackathonId });
  const { data: myRecord } = trpc.hackathon.myParticipantRecord.useQuery(
    { hackathonId },
    { enabled: isRegistered },
  );

  if (eventsLoading)
    return (
      <div className="py-16 text-center text-sm text-[var(--text-muted)]">
        Loading schedule…
      </div>
    );

  // Only accepted participants get a pass. Pending and waitlisted registrations
  // are not admitted yet, so the scanner would reject their code anyway.
  const isAccepted =
    myRecord?.registrationStatus === "approved" ||
    myRecord?.registrationStatus === "checked_in";

  const qrData =
    myRecord && isAccepted
      ? JSON.stringify({
          type: "CHECK_IN",
          hackathonId,
          participantId: myRecord.id,
        })
      : null;

  const passPlaceholder = !isRegistered
    ? "Register to get a pass"
    : myRecord?.registrationStatus === "waitlisted"
      ? "Waitlisted. You'll get a pass if a spot opens."
      : myRecord?.registrationStatus === "rejected"
        ? "Registration not accepted"
        : "Waiting on review. Your pass appears once you're accepted.";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <LiquidGlass
          printed
          className="p-6 text-center flex flex-col items-center justify-center"
        >
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">
            Your check-in pass
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-6 leading-relaxed">
            Show this at check-in, meals, and workshops.
          </p>

          {isRegistered && qrData ? (
            <div className="p-4 rounded-sm border border-[var(--border-subtle)]">
              {/* literal white: must match the QR bgColor below in both themes */}
              <div className="p-4 bg-[#ffffff] rounded-sm">
                <QRCodeSVG
                  value={qrData}
                  size={180}
                  level="H"
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              </div>
            </div>
          ) : (
            <div className="w-[220px] h-[220px] border-2 border-dashed border-[var(--border-subtle)] rounded-sm flex flex-col items-center justify-center text-[var(--text-muted)]">
              <Lock className="w-8 h-8 mb-4 text-[var(--text-subtle)]" />
              <span className="text-xs text-[var(--text-muted)] text-center px-6">
                {passPlaceholder}
              </span>
            </div>
          )}
        </LiquidGlass>

        {isRegistered && myRecord && (
          <LiquidGlass printed className="p-6">
            <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">
              Registration
            </h4>
            <ul className="space-y-3 text-sm text-[var(--text-muted)]">
              <li className="flex justify-between items-center p-3 rounded-sm border border-[var(--border-subtle)]">
                <span>Status</span>
                <StatusBadge status={myRecord.registrationStatus} />
              </li>
              <li className="flex justify-between items-center p-3 rounded-sm border border-[var(--border-subtle)]">
                <span>Shirt size</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {myRecord.shirtSize || "Not set"}
                </span>
              </li>
            </ul>
          </LiquidGlass>
        )}
      </div>
      <div className="lg:col-span-2 space-y-4">
        <LiquidGlass printed className="p-6">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
              Schedule
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              {events?.length || 0} events
            </span>
          </div>

          {!events || events.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[var(--text-subtle)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                The schedule hasn&apos;t been posted yet.
              </p>
            </div>
          ) : (
            <div className="relative border-l border-[var(--border-subtle)] ml-4 space-y-10 pb-4">
              {events.map((event) => (
                <div key={event.id} className="relative pl-8">
                  <span className="absolute -left-[5px] top-2.5 w-2.5 h-2.5 rounded-full bg-[var(--bg-primary)] border-2 border-accent" />

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
                    <h4 className="text-base font-bold text-[var(--text-primary)]">
                      {event.name}
                    </h4>
                    <div className="flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-sm text-sm font-medium text-accent shrink-0">
                      <span>
                        {new Date(event.startTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-[var(--text-subtle)]">—</span>
                      <span>
                        {new Date(event.endTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]">
                      {event.type.replace(/_/g, " ")}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <MapPin className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                      {event.location}
                    </span>
                  </div>

                  {event.description && (
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                      {event.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </LiquidGlass>
      </div>
    </div>
  );
}
