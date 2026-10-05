"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body as bodyText,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  sectionRule,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";

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
  const [showInterest, setShowInterest] = useState(true);

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
  const readOnly = useReadOnly();
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

  const th = "py-2 pr-4 text-[13px] font-medium text-[var(--text-subtle)]";

  return (
    <div className="space-y-12">
      {/* A send that stopped part-way — a closed tab, a lost connection, a
          timeout. The remaining recipients are recorded server-side, so this
          continues rather than starting a second announcement. */}
      {unfinished.length > 0 && (
        <section className="border-l-2 border-[var(--warning)] pl-4">
          <h2 className="text-[15px] font-semibold text-[var(--warning)] mb-3">
            Unfinished sends
          </h2>
          <div className="divide-y divide-[var(--border-subtle)]">
            {unfinished.map((announcement) => (
              <div
                key={announcement.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-[15px] text-[var(--text-primary)]">
                    {announcement.subject}
                  </p>
                  <p className={`mt-1 tabular-nums ${meta}`}>
                    {announcement.sent} sent · {announcement.pending} remaining
                    {announcement.failed > 0
                      ? ` · ${announcement.failed} rejected`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={readOnly || sending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  onClick={() =>
                    drain(announcement.id, announcement.total)
                  }
                  className={btnSecondary}
                >
                  Resume sending
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className={sectionTitle}>Send an announcement</h2>
        <p className={`mt-1 ${meta}`}>
          Plain text only. Sent exactly as typed, no HTML.
        </p>

        <fieldset className="mt-6">
          <legend className={`${label} mb-3`}>Audience</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-5">
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
                className={`py-3 text-left border-t-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  audience === option.id
                    ? "border-accent"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
                }`}
              >
                <p
                  className={`text-[15px] ${audience === option.id ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                >
                  {option.label}
                </p>
                <p className={`mt-0.5 ${meta}`}>{option.hint}</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
                  {counts?.[option.id] ?? "—"}
                </p>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-8 max-w-2xl space-y-5">
          <div>
            <label htmlFor="ann-subject" className={fieldLabel}>
              Subject line
            </label>
            <input
              id="ann-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Registration for Hacklytics is now open"
              className={input}
            />
          </div>

          <div>
            <label htmlFor="ann-heading" className={fieldLabel}>
              Heading inside the email
            </label>
            <input
              id="ann-heading"
              type="text"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              maxLength={200}
              placeholder="Registration is open"
              className={input}
            />
          </div>

          <div>
            <label htmlFor="ann-body" className={fieldLabel}>
              Message
            </label>
            <textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={8}
              placeholder={"Hey,\n\nApplications are open until…"}
              className={`${input} resize-y`}
            />
            <p className={`${fieldHint} tabular-nums`}>
              {body.length}/5000. Blank lines become paragraphs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ann-cta-label" className={fieldLabel}>
                Button label (optional)
              </label>
              <input
                id="ann-cta-label"
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                maxLength={60}
                placeholder="Apply now"
                className={input}
              />
            </div>
            <div>
              <label htmlFor="ann-cta-url" className={fieldLabel}>
                Button link
              </label>
              <input
                id="ann-cta-url"
                type="url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                maxLength={500}
                placeholder="https://datasciencegt.org/hackathons"
                className={input}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={readOnly || !canSend}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={`${btnPrimary} w-full sm:w-auto`}
          >
            {sending
              ? "Sending…"
              : `Send to ${recipientCount} recipient(s)`}
          </button>

          {error && (
            <p
              role="alert"
              className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
            >
              {error}
            </p>
          )}

          {progress && (
            <p
              role="status"
              className="border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)] tabular-nums"
            >
              {progress}
            </p>
          )}
        </div>
      </section>

      <section className={sectionRule}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={itemTitle}>Who is on the interest list</h2>
            <p className={`mt-1 max-w-2xl ${meta}`}>
              School, country, graduation year and experience: the answers the
              public form collects.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowInterest((open) => !open)}
            className={textLink}
          >
            {showInterest ? "Hide list" : "Show list"}
          </button>
        </div>

        {showInterest && (
          <div className="mt-4 overflow-x-auto">
            {(interestRows?.length ?? 0) === 0 ? (
              <p className={bodyText}>
                Nobody has registered interest yet.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className={th}>Name</th>
                    <th className={th}>Email</th>
                    <th className={th}>School</th>
                    <th className={th}>Country</th>
                    <th className={`${th} text-right`}>Grad year</th>
                    <th className={`${th} pr-0`}>Experience</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-muted)]">
                  {interestRows?.map((row) => (
                    <tr
                      key={row.userId}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <td className="py-2.5 pr-4 text-[var(--text-primary)]">
                        {row.name ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4">{row.email}</td>
                      <td className="py-2.5 pr-4">{row.school ?? "—"}</td>
                      <td className="py-2.5 pr-4">{row.country ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {row.graduationYear ?? "—"}
                      </td>
                      <td className="py-2.5">{row.experience ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
