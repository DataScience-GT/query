"use client";

import { useSession } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  body,
  btnSecondary,
  fieldLabel,
  input,
  meta,
  page,
  pageDek,
  sectionRule,
  status as statusText,
} from "@/components/portal/ui";

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

const th = "px-4 py-3 text-[13px] font-medium text-[var(--text-subtle)]";
const td = "px-4 py-3";

export default function AttendeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const { data: eventList } = trpc.events.listAll.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: eventData, isLoading } = trpc.events.getById.useQuery(
    selectedEvent ? { id: selectedEvent } : skipToken,
  );

  const attendees = eventData?.checkIns;

  if (status === "unauthenticated") {
    router.push(loginHref());
    return null;
  }

  const handleDownloadCSV = () => {
    if (!attendees || attendees.length === 0) return;

    const cell = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = attendees.map((a: NonNullable<typeof attendees>[number]) =>
      [
        a.member ? `${a.member.firstName} ${a.member.lastName}` : a.user?.name,
        a.user?.email,
        a.checkInMethod,
        a.checkedInAt ? new Date(a.checkedInAt).toISOString() : "",
      ].map(cell),
    );

    const csv = [
      // No "Points" column: every row carried the same schema default, so the
      // export presented a constant as though it were tracked data.
      ["Name", "Email", "Method", "Checked In At"].map(cell),
      ...rows,
    ]
      .map((r) => r.join(","))
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(eventData?.title ?? "event")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_attendees.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Without this the blob is retained for the lifetime of the page.
    URL.revokeObjectURL(url);
  };

  return (
    <div className={page}>
      <header>
        <h1 className={adminTitle}>Club event attendees</h1>
        <p className={pageDek}>
          Who checked in to each club meeting. Hackathon applications live on
          each edition&apos;s dashboard.
        </p>
      </header>

      <section className="mt-10 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full sm:max-w-sm">
            <label htmlFor="attendees-event" className={fieldLabel}>
              Club event
            </label>
            <select
              id="attendees-event"
              aria-label="Filter attendees by club event"
              value={selectedEvent || ""}
              onChange={(e) => setSelectedEvent(e.target.value || null)}
              className={`${input} min-h-11 cursor-pointer`}
            >
              <option value="">Select a club event…</option>
              {eventList?.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
          {selectedEvent && (
            <button
              type="button"
              onClick={handleDownloadCSV}
              className={btnSecondary}
            >
              <Download
                aria-hidden="true"
                strokeWidth={1.75}
                className="h-4 w-4"
              />
              Export CSV
            </button>
          )}
        </div>

        {isLoading ? (
          <p className={`${meta} ${sectionRule}`}>Loading check-ins…</p>
        ) : !attendees || attendees.length === 0 ? (
          <p className={`${body} ${sectionRule}`}>
            {selectedEvent
              ? "Nobody has checked in to this event yet. Check-ins appear here as people arrive."
              : "Pick a club event to see who checked in."}
          </p>
        ) : (
          <div className="overflow-x-auto border-y border-[var(--border-subtle)]">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b border-[var(--border-subtle)]">
                <tr>
                  <th scope="col" className={th}>
                    Name
                  </th>
                  <th scope="col" className={th}>
                    Email
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={th}>
                    Checked in at
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendees.map((attendee) => (
                  <tr
                    key={attendee.id}
                    className="border-b border-[var(--border-subtle)] last:border-b-0 transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        {}
                        <img
                          src={attendee.user?.image || "/avatars/default.svg"}
                          alt={attendee.user?.name || "Attendee"}
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                        <span className="font-semibold text-[var(--text-primary)]">
                          {attendee.user?.name ||
                            `${attendee.member?.firstName ?? ""} ${attendee.member?.lastName ?? ""}`.trim() ||
                            "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className={`${td} text-[var(--text-muted)]`}>
                      {attendee.user?.email}
                    </td>
                    <td className={td}>
                      <span className={statusText("success")}>Checked in</span>
                    </td>
                    <td
                      className={`${td} whitespace-nowrap tabular-nums text-[var(--text-muted)]`}
                    >
                      {attendee.checkedInAt
                        ? new Date(attendee.checkedInAt).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
