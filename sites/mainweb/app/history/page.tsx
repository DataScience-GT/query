"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import PublicFrame from "@/components/PublicFrame";

const YEARS = [
  {
    year: "2020–21",
    note: "Foundation year. First official hackathon.",
  },
  {
    year: "2021–22",
    note: "First major sponsorship partnerships secured.",
  },
  {
    year: "2022–23",
    note: "Expanded to include AI/ML workshops.",
  },
  {
    year: "2023–24",
    note: "Record-breaking member growth.",
  },
  {
    year: "2024–25",
    note: "Current era of community building at scale.",
  },
  {
    year: "Next",
    note: "Hacklytics 2027 and the next bench of projects.",
  },
];

export default function HistoryPage() {
  return (
    <PublicFrame note="since 2020">
      <div className="relative min-h-screen">
        <Navbar screen_width={1024} page="history" />
        <main className="pt-20">
          <Section className="py-32">
            <div className="max-w-4xl mx-auto px-6">
              <p className="public-kicker mb-4">Five years in</p>
              <h1 className="public-display text-5xl md:text-6xl mb-6">
                A short tape of how we got here.
              </h1>
              <p className="public-lede mb-16">
                Data Science at Georgia Tech, year by year. Order matters here —
                each term stacked on the last.
              </p>
              <ol className="relative border-l border-[var(--rule)] ml-2 space-y-10">
                {YEARS.map((entry) => (
                  <li key={entry.year} className="pl-8 relative">
                    <span
                      className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-[var(--buzz)] border border-[var(--ink)]"
                      aria-hidden="true"
                    />
                    <h2 className="public-display text-2xl mb-2">
                      {entry.year}
                    </h2>
                    <p className="text-[var(--ink-soft)] leading-relaxed">
                      {entry.note}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </Section>
        </main>
        <Footer />
      </div>
    </PublicFrame>
  );
}
