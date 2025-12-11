"use client";

import { useState, useEffect } from "react";
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Major from "@/components/Text/Major";
import Mini from "@/components/Text/Mini";
import Link from "next/link";

const CompletedEventPage = () => {
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
      {/* Background */}
      <Background className="absolute inset-0 z-0" />

      {/* Navbar */}
      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30"
        page="other" // Use a generic page type to load non-home links
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-grow pt-[80px] flex items-center justify-center p-6">
        <div className="text-center p-10 max-w-3xl rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl space-y-6">
          <Major type="b" className="text-white">
            Hey! This Event Is Over 😥
          </Major>
          <Mini className="text-gray-200">
            Thank you for your interest! The current sign-up or event period has concluded.
            However, we encourage you to look around the rest of the website to learn about
            our projects, Hacklytics, and how to get involved in the future!
          </Mini>
          <div className="flex justify-center gap-4">
            <Link
              href="/"
              className="px-6 py-3 bg-blue-600 text-white font-bold rounded-full transition-all duration-300 hover:bg-blue-700 hover:shadow-lg"
            >
              Go to Home Page
            </Link>
            <Link
              href="/team"
              className="px-6 py-3 border border-gray-400 text-gray-200 font-bold rounded-full transition-all duration-300 hover:bg-white/10"
            >
              Meet the Team
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer screen_width={windowWidth} />
    </div>
  );
};

export default CompletedEventPage;