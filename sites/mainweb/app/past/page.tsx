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
    <div id="completed-event-page" className="relative min-h-screen flex flex-col">
      <Background className="absolute inset-0 z-0" />

      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30"
        page="other"
      />

      <main className="relative z-10 flex-grow pt-[80px] flex items-center justify-center p-4 sm:p-6 md:p-10">
        <div className="text-center p-8 sm:p-10 max-w-lg w-full rounded-3xl bg-white/10 backdrop-blur-lg border border-white/20 shadow-2xl space-y-7 transition-all duration-500 hover:shadow-white/20">

          {/* Icon/Emoji div removed as requested */}

          <Major type="b" className="text-white text-3xl sm:text-4xl">
            Hey, currently this is unavailable
          </Major>

          <Mini className="text-gray-300 max-w-md mx-auto leading-relaxed">
            We appreciate your interest! Please check back later, or explore our website to learn more about our projects, Hacklytics, and how you can get involved.
          </Mini>

          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
            <Link
              href="/"
              className="w-full sm:w-auto px-8 py-3 bg-indigo-500 text-white font-semibold rounded-xl transition-all duration-300 ease-in-out hover:bg-indigo-600 shadow-lg hover:shadow-indigo-500/50 transform hover:-translate-y-0.5"
            >
              Go to Home Page
            </Link>
            <Link
              href="/team"
              className="w-full sm:w-auto px-8 py-3 border border-gray-500 text-gray-300 font-semibold rounded-xl transition-all duration-300 ease-in-out hover:bg-white/10 hover:border-white/30"
            >
              Meet the Team
            </Link>
          </div>
        </div>
      </main>

      <Footer screen_width={windowWidth} />
    </div>
  );
};

export default CompletedEventPage;