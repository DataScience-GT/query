"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";

export default function StatusPage() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <Navbar screen_width={1024} page="status" />
      <main className="pt-20">
        <Section className="py-32">
          <div className="max-w-4xl mx-auto px-6">
            <h1 className="text-5xl font-black uppercase tracking-tight mb-8">
              Status
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed mb-12 italic">
              System status and operational updates.
            </p>
            <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-2xl p-8 mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400 uppercase tracking-widest text-xs">
                  Database
                </span>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded text-xs uppercase tracking-widest">
                  Operational
                </span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400 uppercase tracking-widest text-xs">
                  API
                </span>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded text-xs uppercase tracking-widest">
                  Operational
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 uppercase tracking-widest text-xs">
                  Auth Service
                </span>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded text-xs uppercase tracking-widest">
                  Operational
                </span>
              </div>
            </div>
            <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-2xl p-8">
              <h2 className="text-xl font-bold uppercase mb-4">Last Updated</h2>
              <p className="text-gray-500 italic">
                System check completed successfully.
              </p>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
