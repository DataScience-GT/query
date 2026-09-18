import type { ReactNode } from "react";

export default function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-white/40 mb-3">
      {children}
    </p>
  );
}
