import type { ReactNode } from "react";

export type Tone = "pink" | "cyan" | "lime" | "purple";

const TONE: Record<Tone, { text: string; dot: string }> = {
  pink: { text: "text-bloom-pink", dot: "bg-bloom-pink shadow-[0_0_10px_rgba(255,45,120,0.9)]" },
  cyan: { text: "text-bloom-cyan", dot: "bg-bloom-cyan shadow-[0_0_10px_rgba(0,229,255,0.9)]" },
  lime: { text: "text-bloom-lime", dot: "bg-bloom-lime shadow-[0_0_10px_rgba(200,255,0,0.9)]" },
  purple: { text: "text-[#c77dff]", dot: "bg-bloom-purple shadow-[0_0_10px_rgba(155,0,255,0.9)]" },
};

/** Section label in the hero's pixel type, so the theme carries past the fold. */
export default function Eyebrow({
  children,
  index,
  tone = "cyan",
}: {
  children: ReactNode;
  /** Two-digit section number, shown before the label. */
  index?: string;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <p className={`flex items-center gap-3 font-pixel text-[11px] md:text-xs uppercase mb-5 ${t.text}`}>
      <span aria-hidden className={`h-2 w-2 ${t.dot}`} />
      {index && <span className="text-white/35">{index}</span>}
      <span>{children}</span>
    </p>
  );
}
