import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";

const YEARS = [
  { year: "2020-2021", note: "Foundation year. First official hackathon." },
  { year: "2021-2022", note: "First major sponsorship partnerships secured." },
  { year: "2022-2023", note: "Expanded to include AI/ML workshops." },
  { year: "2023-2024", note: "Record-breaking member growth." },
  {
    year: "2024-2025",
    note: "Current era of innovation and community building.",
  },
  { year: "Future", note: "Building toward Hacklytics 2026 and beyond." },
];

export default function HistoryPage() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <Navbar screen_width={1024} page="history" />
      <main className="pt-20">
        <Section className="py-24 sm:py-32">
          <div className="max-w-4xl mx-auto px-6">
            <h1 className="text-5xl font-bold tracking-tighter sm:text-6xl">
              History
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-300">
              Five years of DSGT, one school year at a time.
            </p>
            <ol className="mt-16 border-t border-white/10">
              {YEARS.map(({ year, note }) => (
                <li
                  key={year}
                  className="grid gap-x-12 gap-y-1 border-b border-white/10 py-8 sm:grid-cols-[11rem_1fr] sm:items-baseline"
                >
                  <h2 className="font-mono text-sm uppercase tracking-[0.2em] text-[#00A8A8]">
                    {year}
                  </h2>
                  <p className="text-xl leading-snug text-gray-200">{note}</p>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
