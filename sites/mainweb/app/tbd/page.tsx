"use client";

import { useState, useEffect } from "react";
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Major from "@/components/Text/Major";
import Mini from "@/components/Text/Mini";
import Link from "next/link";

const CompletedEventPage: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    document.body.style.overflow = "auto";

    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div id="completed-event-page" className="relative min-h-screen flex flex-col bg-[#050505] text-gray-400 font-sans selection:bg-indigo-500/30">
      {/* Background with matching low opacity */}
      <Background className="fixed inset-0 z-0 opacity-20" />

      {/* Navbar with glassmorphism */}
      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md"
        page="other"
      />

      <main className="relative z-10 flex-grow pt-40 pb-32 flex items-center justify-center px-6">
        <div className="text-center p-12 max-w-2xl w-full rounded-2xl bg-[#0a0a0a] border border-white/5 shadow-2xl space-y-8 relative overflow-hidden group hover:border-indigo-500/20 transition-all duration-500">

          {/* Subtle background glow for the card */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-500/5 blur-[80px] pointer-events-none"></div>

          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-mono uppercase tracking-[0.2em] mb-4">
              Status: Under Construction
            </div>
            <h1 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic">
              Work in <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500 not-italic">Progress.</span>
            </h1>
          </div>

          <p className="text-gray-400 max-w-md mx-auto leading-relaxed text-sm">
            This module is currently being optimized. Check back soon for updates or explore our live project archives.
          </p>

          <div className="pt-4 space-y-4">
             <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest leading-relaxed">
              Want to contribute? Reach out to <span className="text-indigo-400 font-bold">Aamogh</span> on Slack.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6">
            <Link
              href="/"
              className="px-10 py-4 bg-white text-black font-bold rounded-md transition-all duration-300 hover:bg-gray-200 active:scale-95 text-xs uppercase tracking-widest shadow-lg shadow-white/5"
            >
              Go to Home Page
            </Link>

            <Link
              href="/team"
              className="px-10 py-4 border border-white/10 text-gray-300 font-bold rounded-md transition-all duration-300 hover:bg-white/5 active:scale-95 text-xs uppercase tracking-widest"
            >
              Meet the Team
            </Link>
          </div>
        </div>
      </main>

      <Footer screen_width={windowWidth} className="relative z-10 border-t border-white/5" />
    </div>
  );
};

export default CompletedEventPage;