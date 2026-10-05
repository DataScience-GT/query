/**
 * Class strings for the member portal's "club newsletter" look, so every page
 * draws buttons, fields and headings the same way. Colours come from the
 * tokens in app/(portal)/liquid-glass.css; nothing here hardcodes a hue.
 *
 * - Headlines are Newsreader (--font-display); everything else is the UI face.
 * - One accent: the next action, and "you are here". Not decoration.
 * - Group with space and hairline rules first. A bordered box is for an object
 *   you could hold (a pass, a listing), never for a section.
 */

/** Page headline. One per page, sentence case. */
export const pageTitle =
  "font-[family-name:var(--font-display)] text-[40px] md:text-[56px] font-semibold leading-[1.02] tracking-[-0.025em] text-[var(--text-primary)] text-balance";

/** The dek under a page headline. */
export const pageDek =
  "mt-3 max-w-2xl text-[17px] leading-relaxed text-[var(--text-muted)]";

/** Small line above a headline: a date, a place, a status. At most one per page. */
export const kicker = "text-[13px] font-semibold text-accent";

/** Section heading inside a page. */
export const sectionTitle =
  "font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight tracking-[-0.015em] text-[var(--text-primary)]";

/** Smaller serif heading for an item in a list or a column. */
export const itemTitle =
  "font-[family-name:var(--font-display)] text-[22px] font-semibold leading-snug tracking-[-0.01em] text-[var(--text-primary)]";

/** Quiet label above a group or column. Sentence case, not caps. */
export const label = "text-[13px] font-medium text-[var(--text-subtle)]";

export const body = "text-[15px] leading-relaxed text-[var(--text-muted)]";
export const meta = "text-[13px] text-[var(--text-subtle)]";

/** A horizontal hairline that starts a section. */
export const sectionRule = "border-t border-[var(--border-subtle)] pt-6";

/** Two-pixel ink rule, used once per page under the masthead line. */
export const mastRule = "border-b-2 border-[var(--text-primary)] pb-2.5";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The one thing to do next. At most one per view. */
export const btnPrimary = `${btnBase} px-5 py-2.5 bg-accent text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)]`;

/** Ink button: a strong action that is not the accent's job. */
export const btnInk = `${btnBase} px-5 py-2.5 bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90`;

/** Secondary action. */
export const btnSecondary = `${btnBase} px-4 py-2.5 border border-[var(--border-medium)] text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-secondary)]`;

/** Inline text action, underlined in the accent like a newspaper link. */
export const textLink =
  "inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-primary)] underline decoration-accent decoration-2 underline-offset-[5px] hover:decoration-[var(--text-primary)] transition-colors";

/** Destructive, used away from the primary action. */
export const btnDanger = `${btnBase} px-4 py-2.5 border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger-glow)]`;

export const fieldLabel =
  "block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5";

export const input =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border-medium)] bg-[var(--bg-input)] px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)] disabled:opacity-60 transition-colors";

export const fieldHint = "mt-1.5 text-[13px] text-[var(--text-subtle)]";

/** An object you could pick up: a pass, a listing. Not for sections. */
export const object =
  "rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)]";

/** Underline tabs. The selected one gets ink and the accent rule. */
export const tabList =
  "flex gap-6 border-b border-[var(--border-subtle)] overflow-x-auto overflow-y-hidden [scrollbar-width:none]";
export const tab = (selected: boolean) =>
  `-mb-px whitespace-nowrap border-b-2 py-3 text-sm transition-colors ${
    selected
      ? "border-accent font-semibold text-[var(--text-primary)]"
      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
  }`;

/** Filter chips. */
export const chip = (selected: boolean) =>
  `rounded-full border px-3 py-1 text-[13px] transition-colors ${
    selected
      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold"
      : "border-[var(--border-medium)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
  }`;

/** Status text with a dot. Tone picks the colour; never a filled pill. */
export type Tone = "accent" | "success" | "warning" | "danger" | "neutral";
const toneColor: Record<Tone, string> = {
  accent: "text-accent",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  neutral: "text-[var(--text-subtle)]",
};
export const status = (tone: Tone) =>
  `inline-flex items-center gap-1.5 text-[13px] font-semibold ${toneColor[tone]} before:content-[''] before:h-1.5 before:w-1.5 before:rounded-full before:bg-current`;

/** Page container for member pages. */
export const page = "mx-auto w-full max-w-5xl px-5 sm:px-8 md:px-12 py-10 md:py-14";
