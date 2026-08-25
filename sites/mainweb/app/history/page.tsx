"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";

const eras = [
  {
    years: "2020–2021",
    copy: "Foundation year. First official hackathon.",
  },
  {
    years: "2021–2022",
    copy: "First major sponsorship partnerships secured.",
  },
  {
    years: "2022–2023",
    copy: "Expanded to include AI/ML workshops.",
  },
  {
    years: "2023–2024",
    copy: "Record-breaking member growth.",
  },
  {
    years: "2024–2025",
    copy: "Current era of community building and club infrastructure.",
  },
  {
    years: "Next",
    copy: "Hacklytics 2026 and the next round of member projects.",
  },
];

export default function HistoryPage() {
  return (
    <div className="site-shell">
      <Navbar screen_width={1024} page="history" />
      <main className="pt-20">
        <Section className="py-24">
          <div className="max-w-4xl mx-auto px-6">
            <p className="page-kicker mb-4">Since 2020</p>
            <h1 className="page-title text-5xl mb-6">History</h1>
            <p className="page-lede mb-12">
              Five years of data science at Georgia Tech, year by year.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              {eras.map((era) => (
                <div key={era.years} className="figure-card p-6">
                  <h2 className="text-lg font-display text-white mb-2">
                    {era.years}
                  </h2>
                  <p className="text-sm text-gray-400">{era.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
