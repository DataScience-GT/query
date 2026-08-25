"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BOOTCAMP_CURRICULUM } from "@/lib/bootcamp-schedule";

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
    <div className="site-shell selection:bg-[#00A8A8]/30">
      <Navbar
        screen_width={windowWidth}
        page="bootcamp"
        className="fixed top-0 z-50"
      />

      <main className="relative z-10 pt-40 pb-24 px-6 lg:px-12 max-w-7xl mx-auto">
        <div className="space-y-5 mb-16 max-w-3xl">
          <p className="page-kicker">12 weeks · Python</p>
          <h1 className="page-title text-4xl md:text-6xl">
            Data science bootcamp
          </h1>
          <p className="page-lede">
            From the fundamentals to machine learning. Same syllabus members see
            once they sign in.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          {curriculum.map((item) => (
            <div key={item.week} className="figure-card p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="page-kicker">Week {item.week}</span>
              </div>
              <h3 className="text-xl font-display text-white mb-2">
                {item.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-16">
          <a href="/login" className="btn-solid">
            Apply for the next cohort
          </a>
          <p className="mt-4 text-sm text-gray-500">
            Seats are limited; we open applications before each semester.
          </p>
        </div>
      </main>

      <Footer screen_width={windowWidth} />
    </div>
  );
}
