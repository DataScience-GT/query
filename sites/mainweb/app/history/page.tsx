"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";

export default function HistoryPage() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <Navbar screen_width={1024} page="history" />
      <main className="pt-20">
        <Section className="py-32">
          <div className="max-w-4xl mx-auto px-6">
            <h1 className="text-5xl font-black uppercase tracking-tight mb-8">
              History
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed mb-12 italic">
              Our journey through five years of data science excellence.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-xl p-6">
                <h2 className="text-lg font-bold uppercase mb-3 text-[#00A8A8]">
                  2020-2021
                </h2>
                <p className="text-sm text-gray-500 italic">
                  Foundation year. First official hackathon.
                </p>
              </div>
              <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-xl p-6">
                <h2 className="text-lg font-bold uppercase mb-3 text-[#00A8A8]">
                  2021-2022
                </h2>
                <p className="text-sm text-gray-500 italic">
                  First major sponsorship partnerships secured.
                </p>
              </div>
              <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-xl p-6">
                <h2 className="text-lg font-bold uppercase mb-3 text-[#00A8A8]">
                  2022-2023
                </h2>
                <p className="text-sm text-gray-500 italic">
                  Expanded to include AI/ML workshops.
                </p>
              </div>
              <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-xl p-6">
                <h2 className="text-lg font-bold uppercase mb-3 text-[#00A8A8]">
                  2023-2024
                </h2>
                <p className="text-sm text-gray-500 italic">
                  Record-breaking member growth.
                </p>
              </div>
              <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-xl p-6">
                <h2 className="text-lg font-bold uppercase mb-3 text-[#00A8A8]">
                  2024-2025
                </h2>
                <p className="text-sm text-gray-500 italic">
                  Current era of innovation and community building.
                </p>
              </div>
              <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-xl p-6">
                <h2 className="text-lg font-bold uppercase mb-3 text-[#00A8A8]">
                  Future
                </h2>
                <p className="text-sm text-gray-500 italic">
                  Building toward Hacklytics 2026 and beyond.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
