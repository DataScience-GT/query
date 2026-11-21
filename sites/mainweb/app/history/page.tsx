import type { Metadata } from "next";
import PublicPage from "@/components/PublicPage";

export const metadata: Metadata = {
  title: "History",
  alternates: { canonical: "/history" },
};

const YEARS = [
  { year: "2020-2021", note: "Foundation year. First official hackathon." },
  { year: "2021-2022", note: "First major sponsorship partnerships secured." },
  { year: "2022-2023", note: "Expanded to include AI/ML workshops." },
  { year: "2023-2024", note: "Record-breaking member growth." },
  { year: "2024-2025", note: "Innovation and community building." },
  {
    year: "2025-2026",
    note: "Hacklytics 2026, February 20-22. The member portal opens for dues, event check-in, and judging.",
  },
  {
    year: "2026-2027",
    note: "550+ verified members, a weekly Python bootcamp, and member-run club projects.",
  },
  { year: "Next", note: "Building toward Hacklytics 2027 and beyond." },
];

export default function HistoryPage() {
  return (
    <PublicPage
      title="History"
      lede="DSGT since 2020, one school year at a time."
    >
      <ol className="max-w-4xl border-t border-white/10">
        {YEARS.map(({ year, note }) => (
          <li
            key={year}
            className="grid gap-x-12 gap-y-1 border-b border-white/10 py-8 sm:grid-cols-[11rem_1fr] sm:items-baseline"
          >
            <h2 className="text-dsgt-teal font-mono text-sm tracking-[0.2em] uppercase">
              {year}
            </h2>
            <p className="text-xl leading-snug text-gray-200">{note}</p>
          </li>
        ))}
      </ol>
    </PublicPage>
  );
}
