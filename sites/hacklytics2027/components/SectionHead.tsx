import React from "react";

/** Shared section masthead: § number, label rule, display title, right-hand note. */
export default function SectionHead({
  num,
  label,
  title,
  note,
}: {
  num: string;
  label: string;
  title: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <header className="rule-heavy-t pt-4">
      <div className="mono-label flex items-center justify-between py-2 text-ink-soft">
        <span>§ {num} — {label}</span>
        <span className="hidden sm:inline">Hacklytics 2027</span>
      </div>

      <div className="rule-t flex flex-col gap-6 pt-6 md:flex-row md:items-end md:justify-between md:gap-16">
        <h2 className="display text-[clamp(2.5rem,8.5vw,7rem)]">{title}</h2>
        {note && (
          <p className="max-w-[32ch] text-sm leading-relaxed text-ink-soft md:pb-3 md:text-right">
            {note}
          </p>
        )}
      </div>
    </header>
  );
}
