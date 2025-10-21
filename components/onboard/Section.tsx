"use client";

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function Section({ title, subtitle, children }: SectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
      <div className="bg-gradient-to-r from-purple-500/5 to-pink-500/5 px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}
