"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  BOOTCAMP_CURRICULUM,
  BOOTCAMP_START_DATE,
} from "@/lib/bootcamp-schedule";

// Shared with the portal's bootcamp page, so the syllabus a member sees signed
// in is the one that was advertised.
const curriculum = BOOTCAMP_CURRICULUM;

export default function BootcampPage() {
  const [windowWidth, setWindowWidth] = useState<number>(1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30">
      <Navbar
        screen_width={windowWidth}
        page="bootcamp"
        className="fixed top-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md"
      />

      <main className="relative z-10 pt-40 pb-20 px-6 lg:px-12 max-w-7xl mx-auto text-center">
        <div className="space-y-6 mb-16">
          <h1 className="text-white text-5xl md:text-7xl font-bold tracking-tighter italic uppercase">
            Python Data Science <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#006e6e] not-italic">
              Bootcamp.
            </span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto italic">
            Master Python for data science in 12 weeks. From the fundamentals to
            machine learning, build the skills you need to succeed.
          </p>
          {BOOTCAMP_START_DATE && (
            <p className="font-mono text-[11px] text-[#00A8A8] uppercase tracking-[0.3em]">
              Starts {BOOTCAMP_START_DATE}
            </p>
          )}
        </div>

        {curriculum.length === 0 ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-[#00A8A8]/20 bg-[#00A8A8]/[0.04] p-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00A8A8]">
              Updating soon
            </p>
            <p className="mt-4 text-sm text-gray-400 leading-relaxed italic">
              The week-by-week syllabus is being written now and will be posted
              here before the first session.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {curriculum.map((item, index) => (
              <div
                key={index}
                className="group relative p-[1px] rounded-xl bg-gradient-to-b from-white/10 to-transparent hover:from-[#00A8A8]/50 transition-colors duration-500 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#00A8A8]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative h-full bg-[#0a0a0a] rounded-xl p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono text-[#00A8A8] bg-[#00A8A8]/10 px-3 py-1 rounded-full border border-[#00A8A8]/20">
                        Week {item.week}
                      </span>
                      <span className="text-white/10 text-4xl font-black italic">
                        {item.week.toString().padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-[#00A8A8] transition-colors duration-300">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-20">
          <button className="px-8 py-4 bg-[#00A8A8] hover:bg-[#008f8f] text-white font-semibold rounded-lg transition-colors duration-300 transform hover:scale-105 active:scale-95">
            Apply for Next Cohort
          </button>
          <p className="mt-4 text-xs text-gray-600 font-mono uppercase tracking-widest">
            Spots are extremely limited
          </p>
        </div>
      </main>

      <Footer
        screen_width={windowWidth}
        className="fixed bottom-0 z-10 mt-20"
      />
    </div>
  );
}
