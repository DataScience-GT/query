"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Megaphone } from "lucide-react";

const AUDIENCES = [
  {
    id: "interested" as const,
    label: "Interest list",
    hint: "Signed up to hear when this edition opens",
  },
  {
    id: "registered" as const,
    label: "All registered",
    hint: "Pending, approved and checked in",
  },
  {
    id: "approved" as const,
    label: "Accepted only",
    hint: "Approved but not yet arrived",
  },
  {
    id: "checked_in" as const,
    label: "On site",
    hint: "Checked in at the door",
  },
  {
    id: "not_accepted" as const,
    label: "Not accepted",
    hint: "Rejected and waitlisted — excluded from every other audience",
  },
];

/**
 * A starting point for the one message that is hard to write, and easy to get
 * wrong by sending the wrong tone from a blank box. Entirely editable — it is
 * prefilled only when the audience is selected and nothing has been typed yet.
 */
const NOT_ACCEPTED_TEMPLATE = {
  subject: "An update on your application",
  heading: "An update on your application",
  body: [
    "Thank you for applying. We had far more applications than places this year, and we were not able to offer you one.",
    "This is not a judgement of you or your work — the numbers simply did not allow it, and turning people down is the part of running this we like least.",
    "We would genuinely welcome an application from you next time, and our other events are open to everyone in the meantime.",
  ].join("\n\n"),
};

type Audience = (typeof AUDIENCES)[number]["id"];

export function AnnouncementsTab({ hackathonId }: { hackathonId: string }) {
  const [audience, setAudience] = useState<Audience>("interested");
  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInterest, setShowInterest] = useState(false);

  // The four questions the public form collects were shown to no organiser at
  // all — the data was gathered and then only ever read as a recipient count.
  const { data: interestRows } = trpc.hackathon.listInterest.useQuery(
    { hackathonId },
    { enabled: showInterest },
  );

  const { data: counts } = trpc.hackathon.audienceCounts.useQuery({
    hackathonId,
  });

  const utils = trpc.useUtils();
  const { data: announcements } = trpc.hackathon.listAnnouncements.useQuery({
    hackathonId,
  });

  const createAnnouncement = trpc.hackathon.createAnnouncement.useMutation();
  const sendBatch = trpc.hackathon.sendBatch.useMutation();

  const recipientCount = counts?.[audience] ?? 0;

  const unfinished =
    announcements?.filter((a) => a.pending > 0) ?? [];
  const canSend =
    subject.trim().length > 0 &&
    heading.trim().length > 0 &&
    body.trim().length > 0 &&
    recipientCount > 0 &&
    !sending;

  /**
   * Walks an announcement's remaining recipients until the server reports none.
   *
   * Sequential rather than concurrent: this is one provider account being asked
   * for thousands of sends, and firing batches in parallel is how an
   * announcement gets throttled into a partial delivery nobody notices.
   *
   * Every recipient is marked server-side as their message goes out, so closing
   * the tab half-way through loses nothing — reopening offers to resume, and
   * nobody is mailed twice.
   */
  const drain = async (announcementId: string, total: number) => {
    setSending(true);
    setError(null);
    let sent = 0;
    let failed = 0;

    // Bounded rather than `while (true)`: a server that stopped decreasing
    // `remaining` would otherwise loop forever, mailing the same batch.
    for (let guard = 0; guard < 100; guard++) {
      try {
        const result = await sendBatch.mutateAsync({ announcementId });

        sent += result.sent;
        failed += result.failed.length;
        setProgress(
          total > 0
            ? `Sent ${sent} of ${total}, ${result.remaining} to go...`
            : `Sent ${sent}, ${result.remaining} to go...`,
        );

        if (result.done) break;
        // Nothing moved and nothing is left to try: stop rather than spin.
        if (result.sent === 0 && result.failed.length === 0) break;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Announcement failed");
        break;
      }
    }

    setProgress(
      `Done. ${sent} delivered${failed > 0 ? `, ${failed} failed` : ""}.`,
    );
    setSending(false);
    utils.hackathon.listAnnouncements.invalidate({ hackathonId });
  };

  const handleSend = async () => {
    if (
      !window.confirm(
        `Send "${subject}" to ${recipientCount} recipient(s)?\n\nThis cannot be unsent.`,
      )
    )
      return;

    setSending(true);
    setError(null);

    try {
      const created = await createAnnouncement.mutateAsync({
        hackathonId,
        audience,
        subject: subject.trim(),
        heading: heading.trim(),
        body: body.trim(),
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
      });

      utils.hackathon.listAnnouncements.invalidate({ hackathonId });
      await drain(created.announcementId, created.totalRecipients);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Announcement failed");
      setSending(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      {/* A send that stopped part-way — a closed tab, a lost connection, a
          timeout. The remaining recipients are recorded server-side, so this
          continues rather than starting a second announcement. */}
      {unfinished.length > 0 && (
        <LiquidGlass className="p-6 border-amber-500/30">
          <h2 className="text-sm font-bold text-amber-300 uppercase tracking-widest mb-3">
            Unfinished sends
          </h2>
          <div className="space-y-3">
            {unfinished.map((announcement) => (
              <div
                key={announcement.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-mono">
                    {announcement.subject}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--text-subtle)] mt-1">
                    {announcement.sent} sent · {announcement.pending} remaining
                    {announcement.failed > 0
                      ? ` · ${announcement.failed} rejected`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() =>
                    drain(announcement.id, announcement.total)
                  }
                  className="px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider rounded-none hover:bg-amber-500/20 transition-colors disabled:opacity-40"
                >
                  Resume
                </button>
              </div>
            ))}
          </div>
        </LiquidGlass>
      )}

      <LiquidGlass className="p-6 border-[var(--border-subtle)]">
        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2 mb-2">
          <Megaphone className="w-4 h-4 text-accent" />
          Send an Announcement
        </h2>
        <p className="text-xs font-mono text-[var(--text-subtle)] mb-6">
          Plain text only. Written exactly as typed — no HTML.
        </p>

        <fieldset className="mb-6">
          <legend className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-3 font-mono">
            Audience
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {AUDIENCES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setAudience(option.id);
                  // Only into an untouched form: an organiser part-way through
                  // writing something must never have it overwritten.
                  if (
                    option.id === "not_accepted" &&
                    !subject.trim() &&
                    !heading.trim() &&
                    !body.trim()
                  ) {
                    setSubject(NOT_ACCEPTED_TEMPLATE.subject);
                    setHeading(NOT_ACCEPTED_TEMPLATE.heading);
                    setBody(NOT_ACCEPTED_TEMPLATE.body);
                  }
                }}
                aria-pressed={audience === option.id}
                className={`p-4 text-left border rounded-none transition-colors ${
                  audience === option.id
                    ? "bg-accent/10 border-accent/40"
                    : "bg-[var(--bg-primary)]/40 border-[var(--border-subtle)] hover:border-accent/20"
                }`}
              >
                <p
                  className={`text-sm font-bold ${audience === option.id ? "text-accent" : "text-[var(--text-primary)]"}`}
                >
                  {option.label}
                </p>
                <p className="text-[10px] font-mono text-[var(--text-subtle)] mt-1">
                  {option.hint}
                </p>
                <p className="text-lg font-black font-mono text-[var(--text-primary)] mt-2">
                  {counts?.[option.id] ?? "—"}
                </p>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="ann-subject"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Subject line
            </label>
            <input
              id="ann-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Registration for Hacklytics is now open"
              className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="ann-heading"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Heading (inside the email)
            </label>
            <input
              id="ann-heading"
              type="text"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              maxLength={200}
              placeholder="Registration is open"
              className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="ann-body"
              className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
            >
              Message
            </label>
            <textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={8}
              placeholder={"Hey,\n\nApplications are open until…"}
              className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors resize-y"
            />
            <p className="text-[10px] font-mono text-[var(--text-subtle)] mt-1">
              {body.length}/5000 — blank lines become paragraphs
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="ann-cta-label"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Button label (optional)
              </label>
              <input
                id="ann-cta-label"
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                maxLength={60}
                placeholder="Apply now"
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="ann-cta-url"
                className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
              >
                Button link
              </label>
              <input
                id="ann-cta-url"
                type="url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                maxLength={500}
                placeholder="https://datasciencegt.org/hackathons"
                className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="mt-6 w-full px-8 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-sm uppercase tracking-widest rounded-none hover:bg-accent/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono"
        >
          {sending
            ? "Sending…"
            : `Send to ${recipientCount} recipient(s)`}
        </button>

        {error && (
          <div
            role="alert"
            className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-300"
          >
            {error}
          </div>
        )}

        {progress && (
          <div
            role="status"
            className="mt-4 border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-mono text-accent"
          >
            {progress}
          </div>
        )}
      </LiquidGlass>

      <LiquidGlass className="p-6 border-[var(--border-subtle)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">
              Who is on the interest list
            </h2>
            <p className="text-xs font-mono text-[var(--text-subtle)] mt-1">
              School, country, graduation year and experience — the answers the
              public form collects.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowInterest((open) => !open)}
            className="px-4 py-2.5 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider rounded-none hover:bg-white/10 transition-colors"
          >
            {showInterest ? "Hide" : "Show"}
          </button>
        </div>

        {showInterest && (
          <div className="mt-4 overflow-x-auto">
            {(interestRows?.length ?? 0) === 0 ? (
              <p className="text-xs font-mono text-[var(--text-subtle)]">
                Nobody has registered interest yet.
              </p>
            ) : (
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="text-[var(--text-subtle)] uppercase tracking-wider">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">School</th>
                    <th className="py-2 pr-4">Country</th>
                    <th className="py-2 pr-4">Grad</th>
                    <th className="py-2 pr-4">Experience</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-muted)]">
                  {interestRows?.map((row) => (
                    <tr
                      key={row.userId}
                      className="border-t border-[var(--border-subtle)]"
                    >
                      <td className="py-2 pr-4 text-[var(--text-primary)]">
                        {row.name ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{row.email}</td>
                      <td className="py-2 pr-4">{row.school ?? "—"}</td>
                      <td className="py-2 pr-4">{row.country ?? "—"}</td>
                      <td className="py-2 pr-4">{row.graduationYear ?? "—"}</td>
                      <td className="py-2 pr-4">{row.experience ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </LiquidGlass>
    </div>
  );
}
