// src/app/not-found.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
  const [windowWidth, setWindowWidth] = useState<number>(1024);

  useEffect(() => {
    // Sync window width for Navbar responsiveness
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="site-shell flex flex-col min-h-screen selection:bg-[#00A8A8]/30">
      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30"
        page="other"
      />

      <main className="relative z-10 flex-grow pt-40 pb-32 flex items-center justify-center px-6">
        <div className="figure-card p-12 max-w-2xl w-full space-y-6 text-center">
          <p className="page-kicker">404</p>
          <h1 className="page-title text-4xl md:text-6xl">
            That page isn&apos;t here
          </h1>
          <p className="page-lede mx-auto">
            The address doesn&apos;t match anything on the site. Head home, or
            browse what members have built.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
            <Link href="/" className="btn-solid">
              Back to home
            </Link>
            <Link href="/projects" className="btn-line">
              View projects
            </Link>
          </div>
        </div>
      </main>

      <Footer screen_width={windowWidth} className="relative z-10" />
    </div>
  );
}
