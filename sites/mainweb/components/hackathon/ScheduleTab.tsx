"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { QRCodeSVG } from "qrcode.react";

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
      <div className="py-16 text-center text-xs font-semibold uppercase tracking-widest text-[var(--text-primary)]/40 animate-pulse">
        Loading schedule...
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
    ? "Registration Required"
    : myRecord?.registrationStatus === "waitlisted"
      ? "Waitlisted — pass issued if a spot opens"
      : myRecord?.registrationStatus === "rejected"
        ? "Registration not accepted"
        : "Awaiting approval — pass appears once accepted";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <LiquidGlass className="p-8 text-center flex flex-col items-center justify-center relative overflow-hidden bg-white/[0.01] border-[var(--border-subtle)]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-sm blur-3xl pointer-events-none" />
          <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight mb-2">
            My Event Pass
          </h3>
          <p className="text-xs text-[var(--text-primary)]/40 mb-8 leading-relaxed">
            Present this pass to check into workshops, meals, and other events.
          </p>

          {isRegistered && qrData ? (
            <div className="p-6 bg-white/5 backdrop-blur-md rounded-none border border-[var(--border-subtle)] shadow-[0_0_40px_rgba(16,185,129,0.15)]">
              <div className="p-4 bg-white rounded-none">
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
            <div className="w-[220px] h-[220px] bg-white/[0.02] border-2 border-dashed border-[var(--border-subtle)] rounded-none flex flex-col items-center justify-center text-[var(--text-primary)]/30">
              <svg
                className="w-10 h-10 mb-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span className="text-xs font-semibold uppercase text-center px-6">
                {passPlaceholder}
              </span>
            </div>
          )}
        </LiquidGlass>

        {isRegistered && myRecord && (
          <LiquidGlass className="p-6 bg-white/[0.01] border-[var(--border-subtle)]">
            <h4 className="text-[11px] font-bold text-[var(--text-primary)]/40 uppercase tracking-widest mb-5">
              Registration Details
            </h4>
            <ul className="space-y-4 text-sm text-[var(--text-primary)]/60">
              <li className="flex justify-between items-center bg-white/[0.02] p-3 rounded-none border border-[var(--border-subtle)]">
                <span>Status</span>
                <span className="text-accent font-semibold">
                  {myRecord.registrationStatus}
                </span>
              </li>
              <li className="flex justify-between items-center bg-white/[0.02] p-3 rounded-none border border-[var(--border-subtle)]">
                <span>Shirt Size</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {myRecord.shirtSize || "Pending"}
                </span>
              </li>
            </ul>
          </LiquidGlass>
        )}
      </div>
      <div className="lg:col-span-2 space-y-4">
        <LiquidGlass className="p-8 md:p-10 bg-white/[0.01] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-10 pb-6 border-b border-[var(--border-subtle)]">
            <h3 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              Schedule
            </h3>
            <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-emerald-400/20 px-3.5 py-1.5 rounded-sm">
              {events?.length || 0} Events
            </span>
          </div>

          {!events || events.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-white/[0.02] border border-[var(--border-subtle)] rounded-none flex items-center justify-center mb-6">
                <svg
                  className="w-8 h-8 text-[var(--text-primary)]/30"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                No Events Scheduled
              </h3>
              <p className="text-sm text-[var(--text-primary)]/40">
                Check back later for updates to the event itinerary.
              </p>
            </div>
          ) : (
            <div className="relative border-l border-[var(--border-subtle)] ml-4 space-y-10 pb-4">
              {events.map((event) => (
                <div key={event.id} className="relative pl-8 group">
                  <span className="absolute -left-[5px] top-2.5 w-2.5 h-2.5 rounded-sm bg-[#020202] border-2 border-emerald-500 group-hover:bg-emerald-400 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.5)]" />

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
                    <h4 className="text-xl font-semibold text-[var(--text-primary)] group-hover:text-emerald-300 transition-colors">
                      {event.name}
                    </h4>
                    <div className="flex items-center gap-2 bg-white/5 border border-[var(--border-subtle)] px-3 py-1.5 rounded-none text-sm font-medium text-accent shrink-0">
                      <span>
                        {new Date(event.startTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-[var(--text-primary)]/20">—</span>
                      <span>
                        {new Date(event.endTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-[10px] font-semibold text-[var(--text-primary)]/50 uppercase tracking-widest px-2.5 py-1 rounded-md bg-white/[0.03] border border-[var(--border-subtle)]">
                      {event.type.replace(/_/g, " ")}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]/40 font-medium">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                      </svg>
                      {event.location}
                    </span>
                    {event.points > 0 && (
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1 ml-1">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11.049 2.927c.3-.921 1.603-.921 1.898 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                          />
                        </svg>
                        {event.points} pts
                      </span>
                    )}
                  </div>

                  {event.description && (
                    <p className="text-sm text-[var(--text-primary)]/50 leading-relaxed bg-white/[0.01] p-4 rounded-none border border-[var(--border-subtle)]">
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
