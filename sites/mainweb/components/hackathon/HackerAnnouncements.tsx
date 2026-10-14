"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  body as bodyText,
  itemTitle,
  meta,
  textLink,
} from "@/components/portal/ui";

// Longer than this, or past three lines, and the body starts collapsed behind
// "Show more". Shorter ones have nothing to reveal.
const COLLAPSE_AFTER_CHARS = 200;
const COLLAPSE_AFTER_LINES = 3;

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

// The link is typed in by an organiser and rendered in a hacker's browser, so
// only a real web address becomes an href. `javascript:` passes URL parsing.
const safeHref = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

function Announcement({
  announcement,
}: {
  announcement: {
    heading: string;
    body: string;
    cta: { label: string; url: string } | null;
    sentAt: Date | string;
  };
}) {
  const [open, setOpen] = useState(false);

  const collapsible =
    announcement.body.length > COLLAPSE_AFTER_CHARS ||
    announcement.body.split("\n").length > COLLAPSE_AFTER_LINES;
  const href = announcement.cta ? safeHref(announcement.cta.url) : null;

  return (
    <article className="py-4">
      <p className={meta}>{dateFmt.format(new Date(announcement.sentAt))}</p>
      <h3 className="mt-1 text-[17px] font-semibold text-[var(--text-primary)]">
        {announcement.heading}
      </h3>
      <p
        className={`mt-2 whitespace-pre-line ${bodyText} ${
          collapsible && !open ? "line-clamp-3" : ""
        }`}
      >
        {announcement.body}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            className={textLink}
          >
            {open ? "Show less" : "Show more"}
          </button>
        )}
        {announcement.cta && href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={textLink}
          >
            {announcement.cta.label}
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * The latest announcements organisers sent to this hacker, newest first. Reads
 * the audience each one was frozen to when it was composed, so it shows only
 * what was addressed to them. Renders nothing while loading, on error, and
 * when there is nothing to show, so it can sit on a page without a placeholder.
 */
export function HackerAnnouncements({ hackathonId }: { hackathonId: string }) {
  const { data: announcements } = trpc.hackathon.listForMe.useQuery({
    hackathonId,
  });

  if (!announcements || announcements.length === 0) return null;

  return (
    <section
      aria-labelledby="hacker-announcements-title"
      className="mt-8 max-w-xl"
    >
      <h2 id="hacker-announcements-title" className={itemTitle}>
        Announcements
      </h2>
      <div className="mt-2 divide-y divide-[var(--border-subtle)]">
        {announcements.map((announcement, index) => (
          <Announcement
            key={`${String(announcement.sentAt)}-${index}`}
            announcement={announcement}
          />
        ))}
      </div>
    </section>
  );
}
